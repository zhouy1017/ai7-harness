const CHAT = 'openai-chat-completions';
const RESPONSES = 'openai-responses';
const MESSAGES = 'anthropic-messages';
const GEMINI = 'google-generate-content';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => {
  if (!Array.isArray(value) || !value.every(record)) throw new Error('wire-list');
  return value;
};
const string = value => {
  if (typeof value !== 'string') throw new Error('wire-string');
  return value;
};
const text = (value, acceptedTypes) => typeof value === 'string' ? value
  : list(value).map(part => {
    if (!acceptedTypes.includes(part.type)) throw new Error('wire-text');
    return string(part.text);
  }).join('');
const call = (id, name, args) => ({ id: string(id), type: 'function', function: { name: string(name), arguments: string(args) } });
const result = (id, content, isError = false) => ({ role: 'tool', tool_call_id: string(id), content: string(content), isError });
const assistant = (content, calls) => ({ role: 'assistant', content, ...(calls.length > 0 ? { tool_calls: calls } : {}) });

export function admittedCaptureEndpoint(endpoint, shape, model, subject, { route, stream } = {}) {
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) return false;
  if (shape === GEMINI) {
    if (!/^[\w.-]+$/u.test(model)) return false;
    const expected = stream ? ':streamGenerateContent' : ':generateContent';
    return endpoint.pathname.endsWith('/' + model + expected) && endpoint.search === (stream ? '?alt=sse' : '');
  }
  if (endpoint.search) return false;
  if (shape === 'editorial-dialogue-sse') return subject === 'dialogue' && route === 'opencode-go';
  return [CHAT, RESPONSES, MESSAGES].includes(shape);
}

/** Translate the product encoders' conversation shapes to the fixture owner's textual turns. */
export function captureMessages(body, shape) {
  if (shape === CHAT || shape === 'editorial-dialogue-sse') return list(body.messages);
  const messages = [];
  const pushText = (role, content) => {
    if (role !== 'user' && role !== 'assistant') throw new Error('wire-role');
    messages.push({ role, content });
  };
  const pushSystem = content => messages.push({ role: 'system', content });
  if (shape === RESPONSES) {
    if (body.instructions !== undefined) pushSystem(string(body.instructions));
    for (const item of list(body.input)) {
      if (item.type === 'reasoning') continue;
      if (item.type === 'function_call_output') {
        messages.push(result(item.call_id, item.output));
      } else if (item.type === 'function_call') {
        const tail = messages.at(-1);
        if (tail?.role === 'assistant') (tail.tool_calls ??= []).push(call(item.call_id, item.name, item.arguments));
        else messages.push(assistant('', [call(item.call_id, item.name, item.arguments)]));
      } else if (item.type === undefined || item.type === 'message') {
        pushText(item.role, text(item.content, ['input_text', 'output_text']));
      } else throw new Error('wire-item');
    }
    return messages;
  }
  if (shape === MESSAGES) {
    if (body.system !== undefined) pushSystem(text(body.system, ['text']));
    for (const item of list(body.messages)) {
      if (typeof item.content === 'string') {
        pushText(item.role, item.content);
        continue;
      }
      const parts = list(item.content);
      if (item.role === 'user' && parts.length > 0 && parts.every(part => part.type === 'tool_result')) {
        messages.push(...parts.map(part => result(part.tool_use_id, text(part.content, ['text']), part.is_error === true)));
      } else if (item.role === 'assistant') {
        messages.push(anthropicAnswer(parts));
      } else pushText(item.role, text(parts, ['text']));
    }
    return messages;
  }
  if (shape !== GEMINI) throw new Error('wire-shape');
  if (body.systemInstruction !== undefined) pushSystem(geminiText(list(body.systemInstruction.parts)));
  let pending = [];
  let ordinal = 0;
  for (const item of list(body.contents)) {
    const parts = list(item.parts);
    if (item.role === 'model') {
      const answer = geminiAnswer(parts, () => 'fixture-gemini-' + ++ordinal);
      pending = [...(answer.tool_calls ?? [])];
      messages.push(answer);
    } else if (item.role === 'user' && parts.length > 0 && parts.every(part => record(part.functionResponse))) {
      messages.push(...parts.map(({ functionResponse: part }) => {
        const active = pending.shift();
        if (active === undefined || active.function.name !== part.name || part.id !== undefined && part.id !== active.id) throw new Error('wire-correlation');
        if (!record(part.response) || Object.keys(part.response).length !== 1) throw new Error('wire-result');
        return result(active.id, part.response.error ?? part.response.output, Object.hasOwn(part.response, 'error'));
      }));
      if (pending.length) throw new Error('wire-correlation');
    } else pushText(item.role, geminiText(parts));
  }
  return messages;
}

function anthropicAnswer(parts) {
  const calls = [], texts = [];
  for (const part of parts) {
    if (part.type === 'text') texts.push(string(part.text));
    else if (part.type === 'tool_use' && record(part.input)) calls.push(call(part.id, part.name, JSON.stringify(part.input)));
    else if (part.type !== 'thinking' && part.type !== 'redacted_thinking') throw new Error('wire-block');
  }
  return assistant(texts.join(''), calls);
}

function geminiText(parts) {
  return parts.map(part => string(part.text)).join('');
}

function geminiAnswer(parts, newId) {
  const calls = [], texts = [];
  for (const part of parts) {
    if (record(part.functionCall) && record(part.functionCall.args)) {
      const { id, name, args } = part.functionCall;
      calls.push(call(id ?? newId(), name, JSON.stringify(args)));
    } else if (part.thought !== true) texts.push(string(part.text));
  }
  return assistant(texts.join(''), calls);
}

export function captureAnswer(body, shape) {
  if (shape === CHAT || shape === 'editorial-dialogue-sse') {
    return { message: list(body.choices)[0]?.message, inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens };
  }
  if (shape === RESPONSES) {
    if (body.status !== undefined && body.status !== 'completed') throw new Error('wire-incomplete');
    const calls = [], texts = [];
    for (const item of list(body.output ?? [])) {
      if (item.type === 'function_call') calls.push(call(item.call_id, item.name, item.arguments));
      else if (item.type === 'message' && item.role === 'assistant') texts.push(text(item.content, ['output_text']));
      else if (item.type !== 'reasoning') throw new Error('wire-item');
    }
    return { message: assistant(texts.length === 0 ? body.output_text ?? '' : texts.join(''), calls),
      inputTokens: body.usage?.input_tokens, outputTokens: body.usage?.output_tokens };
  }
  if (shape === MESSAGES) {
    return { message: anthropicAnswer(list(body.content)), inputTokens: body.usage?.input_tokens, outputTokens: body.usage?.output_tokens };
  }
  if (shape !== GEMINI) throw new Error('wire-shape');
  let ordinal = 0;
  return { message: geminiAnswer(list(body.candidates?.[0]?.content?.parts), () => 'fixture-gemini-' + ++ordinal),
    inputTokens: body.usageMetadata?.promptTokenCount, outputTokens: body.usageMetadata?.candidatesTokenCount };
}
