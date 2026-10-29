/**
 * Conventional Commits: da forma al historial y permite generar changelogs.
 * Ver README → Convenciones.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // El asunto en imperativo, sin punto final, y sin gritar en mayúsculas.
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};
