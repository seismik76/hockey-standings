import base from "../../eslint.config.mjs";

export default [...base, { ignores: [".next/**", "next-env.d.ts"] }];
