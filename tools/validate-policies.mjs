import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A minimal JSON Schema Draft-7 validator against the installed closure only (no dependency).
// It supports exactly the keyword set the nine policy schemas use, verified at
// docs/policies/README.md's Local validation section, and it fails loudly on any other keyword
// rather than silently ignoring it.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICIES_DIR_RELATIVE = 'docs/policies';

const IGNORED_KEYWORDS = new Set(['$schema', 'title', 'description', 'default']);
export const SUPPORTED_KEYWORDS = new Set([
  ...IGNORED_KEYWORDS,
  '$ref',
  'definitions',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'additionalItems',
  'enum',
  'const',
  'pattern',
  'minimum',
  'maximum',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key, index) => key === bKeys[index]) &&
      aKeys.every((key) => deepEqual(a[key], b[key]))
    );
  }
  return false;
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(schemaType, data) {
  if (schemaType === 'integer') {
    return jsonType(data) === 'number' && Number.isInteger(data);
  }
  return jsonType(data) === schemaType;
}

function resolveLocalRef(ref, rootSchema, schemaPath) {
  const match = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(ref);
  if (!match) {
    throw new Error(`Non-local $ref "${ref}" at ${schemaPath}: only "#/definitions/<name>" is supported.`);
  }
  const definition = rootSchema.definitions?.[match[1]];
  if (definition === undefined) {
    throw new Error(`$ref "${ref}" at ${schemaPath} has no matching "#/definitions/${match[1]}".`);
  }
  return { schema: definition, path: `#/definitions/${match[1]}` };
}

function validateNode(schema, data, schemaPath, rootSchema) {
  if (!isPlainObject(schema)) {
    throw new Error(`Schema node at ${schemaPath} is not an object.`);
  }

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`Unsupported schema keyword "${keyword}" at ${schemaPath}.`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, '$ref')) {
    const resolved = resolveLocalRef(schema.$ref, rootSchema, schemaPath);
    validateNode(resolved.schema, data, resolved.path, rootSchema);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !deepEqual(data, schema.const)) {
    throw new Error(`Value at ${schemaPath} does not equal the required const.`);
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'enum') && !schema.enum.some((candidate) => deepEqual(candidate, data))) {
    throw new Error(`Value at ${schemaPath} is not one of the enumerated values.`);
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'type') && !matchesType(schema.type, data)) {
    throw new Error(`Value at ${schemaPath} has type "${jsonType(data)}", expected "${schema.type}".`);
  }

  if (typeof data === 'string' && schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) {
    throw new Error(`Value at ${schemaPath} does not match pattern ${schema.pattern}.`);
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      throw new Error(`Value at ${schemaPath} is below the minimum ${schema.minimum}.`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      throw new Error(`Value at ${schemaPath} is above the maximum ${schema.maximum}.`);
    }
  }

  if (isPlainObject(data) && (schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        throw new Error(`Required property "${key}" is missing at ${schemaPath}.`);
      }
    }
    const properties = schema.properties ?? {};
    for (const key of Object.keys(data)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        validateNode(properties[key], data[key], `${schemaPath}/properties/${key}`, rootSchema);
      } else if (schema.additionalProperties === false) {
        throw new Error(`Unexpected property "${key}" at ${schemaPath}.`);
      }
    }
  }

  if (Array.isArray(data) && (schema.items !== undefined || schema.minItems !== undefined || schema.maxItems !== undefined || schema.uniqueItems !== undefined)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      throw new Error(`Array at ${schemaPath} has fewer than ${schema.minItems} required items.`);
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      throw new Error(`Array at ${schemaPath} has more than ${schema.maxItems} allowed items.`);
    }
    if (schema.uniqueItems === true) {
      const seen = [];
      for (const element of data) {
        if (seen.some((existing) => deepEqual(existing, element))) {
          throw new Error(`Array at ${schemaPath} has duplicate items but uniqueItems is required.`);
        }
        seen.push(element);
      }
    }
    if (Array.isArray(schema.items)) {
      data.forEach((element, index) => {
        if (index < schema.items.length) {
          validateNode(schema.items[index], element, `${schemaPath}/items/${index}`, rootSchema);
        } else if (schema.additionalItems === false) {
          throw new Error(`Array at ${schemaPath} has an item at index ${index} beyond its fixed tuple length, but additionalItems is false.`);
        }
      });
    } else if (schema.items !== undefined) {
      data.forEach((element, index) => {
        validateNode(schema.items, element, `${schemaPath}/items`, rootSchema);
      });
    }
  }
}

export function validatePolicyDocument(policyData, schemaData) {
  validateNode(schemaData, policyData, '#', schemaData);
}

export function discoverPolicyPairs(policiesDir) {
  const entries = readdirSync(policiesDir).filter((name) => name.endsWith('.json'));
  const schemaFiles = new Set(entries.filter((name) => name.endsWith('.schema.json')));
  const policyFiles = entries.filter((name) => !name.endsWith('.schema.json'));

  const matchedSchemas = new Set();
  const pairs = policyFiles
    .map((policyFile) => {
      const schemaFile = policyFile.replace(/\.json$/, '.schema.json');
      if (!schemaFiles.has(schemaFile)) {
        throw new Error(`Policy document "${policyFile}" has no matching schema "${schemaFile}".`);
      }
      matchedSchemas.add(schemaFile);
      return { policyFile, schemaFile };
    })
    .sort((a, b) => a.policyFile.localeCompare(b.policyFile));

  const orphanSchema = [...schemaFiles].find((schemaFile) => !matchedSchemas.has(schemaFile));
  if (orphanSchema) {
    throw new Error(`Schema "${orphanSchema}" has no matching policy document.`);
  }

  return pairs;
}

export function validateAllPolicies(policiesDir) {
  const pairs = discoverPolicyPairs(policiesDir);
  return pairs.map(({ policyFile, schemaFile }) => {
    const policyData = JSON.parse(readFileSync(resolve(policiesDir, policyFile), 'utf8'));
    const schemaData = JSON.parse(readFileSync(resolve(policiesDir, schemaFile), 'utf8'));
    try {
      validatePolicyDocument(policyData, schemaData);
      return { policyFile, ok: true };
    } catch (error) {
      return { policyFile, ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const results = validateAllPolicies(resolve(ROOT, POLICIES_DIR_RELATIVE));
    let failed = false;
    for (const result of results) {
      if (result.ok) {
        console.log(`${result.policyFile}: ok`);
      } else {
        failed = true;
        console.log(`${result.policyFile}: ${result.reason}`);
      }
    }
    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
