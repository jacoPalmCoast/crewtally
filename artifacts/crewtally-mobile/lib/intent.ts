// "Join my team" chosen before sign-in: remembered in memory, used once after sign-in.
let joinAfterSignIn = false;
export const setJoinAfterSignIn = (v: boolean) => { joinAfterSignIn = v; };
export function consumeJoinAfterSignIn(): boolean { const v = joinAfterSignIn; joinAfterSignIn = false; return v; }
