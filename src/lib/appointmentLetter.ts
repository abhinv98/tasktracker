// The words and figures that go into an appointment letter, worked out from an
// offer. The letter itself is src/assets/appointment-letter-template.docx (made
// by scripts/make-appointment-template.py); /api/appointment-letter drops these
// values into its {{placeholders}}.

export type LetterInput = {
  name: string;
  designation: string;
  /** e.g. "Director, Brand Solutions - Neha Mehra" */
  reportsTo: string;
  /** YYYY-MM-DD */
  joiningDate: string;
  /** The date on the letter, YYYY-MM-DD. */
  letterDate: string;
  /** Annual CTC once confirmed, in lakh. */
  confirmedLpa: number;
  /** Annual CTC during probation, in lakh. Null when it is the same. */
  probationLpa: number | null;
  probationMonths: number | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 2026-11-02 -> "2nd November 2026" */
export function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} ${MONTHS[m - 1]} ${y}`;
}

const rupees = (n: number) => n.toLocaleString("en-IN");

/** A month's pay slip from an annual CTC in lakh: half basic, a quarter HRA, the rest other allowance. */
export function paySlip(lpa: number) {
  const gross = Math.round((lpa * 100_000) / 12);
  const basic = Math.round(gross / 2);
  const hra = Math.round(gross / 4);
  return { gross, basic, hra, other: gross - basic - hra };
}

export function letterValues(input: LetterInput): Record<string, string> {
  const probation = input.probationLpa ?? input.confirmedLpa;
  const revised = probation !== input.confirmedLpa;
  const perAnnum = (lpa: number) => `INR ${rupees(Math.round(lpa * 100_000))} per annum`;
  const p = paySlip(probation);
  const c = paySlip(input.confirmedLpa);
  return {
    name: input.name,
    designation: input.designation,
    reportsTo: input.reportsTo,
    letterDate: longDate(input.letterDate),
    joiningDate: longDate(input.joiningDate),
    probationMonths: String(input.probationMonths ?? 3),
    place: "Andheri, Mumbai",
    // The salary sentence: with a revision after probation, or one figure throughout.
    salaryLead: revised
      ? "During your probation period, you will be offered a fixed annual package of "
      : "You will be offered a fixed annual package of ",
    salaryA: perAnnum(probation),
    salaryMid: revised
      ? ". Upon successful completion of your probation period and confirmation of your employment, your CTC will be revised to "
      : "",
    salaryB: revised ? perAnnum(input.confirmedLpa) : "",
    salaryTail: revised
      ? ", as discussed. The detailed salary breakup applicable during pre-probation is mentioned in Annexure I and Annexure II."
      : ". The detailed salary breakup is mentioned in Annexure I and Annexure II.",
    p_basic: rupees(p.basic),
    p_hra: rupees(p.hra),
    p_other: rupees(p.other),
    p_gross: rupees(p.gross),
    c_basic: rupees(c.basic),
    c_hra: rupees(c.hra),
    c_other: rupees(c.other),
    c_gross: rupees(c.gross),
  };
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Fill the template's document.xml. Throws if a placeholder has no value. */
export function fillLetterXml(documentXml: string, values: Record<string, string>) {
  return documentXml.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => {
    if (!(key in values)) throw new Error(`The letter template asks for "${key}", which is not known`);
    return xml(values[key]);
  });
}
