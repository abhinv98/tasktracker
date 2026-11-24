/** The application form on the website. With an opening's code (REQ-26-013 for a
 *  hiring round, POS-007 for a position) it is for that one only. */
export const applyLink = (code: string) => `https://ecultify.com/job-application/?opening=${encodeURIComponent(code)}`;
