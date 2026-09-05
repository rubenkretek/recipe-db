import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "next-env.d.ts", "src/lib/database.types.ts"],
  },
  {
    // Recipe photos are served from a private Supabase bucket through signed
    // URLs, whose token rotates every time one is minted. next/image keys its
    // cache on the URL, so it would re-fetch and re-encode the same photo on
    // every new signature — worse than not optimising at all. The files are
    // already resized to 1600px JPEG in the browser before upload, so there is
    // nothing left for the optimiser to do. Decided in Phase 3.
    files: ["src/components/recipes/**/*.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default eslintConfig;
