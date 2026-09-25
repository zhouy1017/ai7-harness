/**
 * The one fixed time every archive AI7 writes carries (Issue #601): a converted manuscript's working representation, an
 * exported DOCX, and the suites' own archives. A ZIP entry records its time as DOS date and time fields, which fflate
 * reads from the `Date` with local getters, so a fixed instant would be written as a different time on every time zone
 * and the same content would come out as different bytes. This `Date` is built from local fields instead, and read
 * afresh at every use: 2026-01-01 08:00:00 on every host. Those are the fields the UTC+8 hosts already wrote, so on those
 * hosts every digest already computed and every working representation already stored stays as it is. A development store
 * written on a host in another zone before this time existed differs once (Issue #611): a staged converted draft asks to
 * be reselected, which converts it again; a reimport of identical bytes no longer reuses its Source Version; and an export
 * prepared before the change is refused as changed and prepared again.
 */
export function fixedArchiveTime(): Date {
  return new Date(2026, 0, 1, 8, 0, 0);
}
