function isTestFile(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return (
    /(^|\/)(__tests__|__mocks__|fixtures)(\/|$)/.test(normalizedPath) ||
    /(^|\/)(tests?|test-fixtures)(\/|$)/.test(normalizedPath) ||
    /\.(test|spec)\.[^.]+$/.test(normalizedPath)
  );
}

module.exports = {
  isTestFile,
};
