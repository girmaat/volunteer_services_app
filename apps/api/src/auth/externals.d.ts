// This file intentionally left empty.
//
// Earlier patches included ambient module declarations for 3rd-party libraries
// (pg, nodemailer) to make TypeScript happy without installing @types/* packages.
//
// We now ship proper @types/* devDependencies in backend/package.json, so the
// ambient declarations are no longer needed (and can sometimes conflict).
export {};
