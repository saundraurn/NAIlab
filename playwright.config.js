const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  webServer: {
    command: 'npx http-server . -p 8080',
    port: 8080,
    reuseExistingServer: true,
  },
});
