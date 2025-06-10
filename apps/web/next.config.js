const path = require("path");

module.exports = {
  reactStrictMode: true,
  transpilePackages: ["@daap/ui"],
  output: "standalone",
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
};
