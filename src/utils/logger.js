export const logger = { info: (...a) => console.log(new Date().toISOString(), ...a), error: (...a) => console.error(new Date().toISOString(), ...a) };
