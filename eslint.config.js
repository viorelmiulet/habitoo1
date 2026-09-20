import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const paletteHexes = new Set(
  [
    "F7F4EE",
    "FFFFFF",
    "E4DED2",
    "FBF9F5",
    "14171C",
    "5E6570",
    "8A9099",
    "C08A3E",
    "8A5D1C",
    "F6EFE2",
    "1F5138",
    "E3EFE7",
    "8A2F24",
    "F6E4E1",
    "4A5059",
    "EFEBE2",
    "171B21",
    "262C35",
    "D5D1C8",
    "1A1206",
    "D9D2C5",
    "5C3E10",
    "D8B9B3",
    "F3F0EA",
    "9BA2AC",
    "C08880",
  ].map((value) => `#${value}`),
);

const designTokensPlugin = {
  rules: {
    "no-inline-palette": {
      meta: {
        type: "problem",
        messages: { inline: "Folosește tokenul semantic din src/styles.css, nu hex inline." },
        schema: [],
      },
      create(context) {
        const check = (node, value) => {
          const matches = String(value).match(/#[0-9a-f]{6}/gi) ?? [];
          if (matches.some((match) => paletteHexes.has(match.toUpperCase()))) {
            context.report({ node, messageId: "inline" });
          }
        };
        return {
          Literal(node) {
            if (typeof node.value === "string") check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "design-tokens": designTokensPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "design-tokens/no-inline-palette": "error",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
