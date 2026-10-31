// Shared pieces of the Gemini answer formats (lib/reply.js for the tutor, lib/coach-prompt.js for the coach),
// and the one list of levels that the whole app uses (A1, A2, B1).
export const LEVELS = ['A1', 'A2', 'B1'];

export const str = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
export const nullableStr = (description) => str(description, { nullable: true });
export const enumOf = (values, extra = {}) => ({ type: 'STRING', format: 'enum', enum: values, ...extra });
