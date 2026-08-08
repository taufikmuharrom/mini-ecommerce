// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      '@stylistic/semi': 'off',
      '@stylistic/semi-spacing': 'off',
      '@stylistic/no-extra-semi': 'off',
      'semi': 'off',
      '@typescript-eslint/semi': 'off',
      '@stylistic/comma-dangle': 'off',
      'comma-dangle': 'off',
      '@stylistic/quotes': 'off',
      'quotes': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty-function': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      '@stylistic/arrow-parens': 'off',
      'arrow-parens': 'off',
      'vue/singleline-html-element-content-newline': 'off'
    }
  }
)
