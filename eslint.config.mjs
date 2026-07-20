import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
