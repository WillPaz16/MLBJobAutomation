// pm2 config for process supervision — restarts the API if it crashes.
// Usage: pm2 start ecosystem.config.cjs
//        pm2 startup   (one-time, run yourself — modifies system launchd config)
module.exports = {
  apps: [
    {
      name: "job-app-api",
      cwd: __dirname + "/api",
      script: "npx",
      args: "tsx src/index.ts",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
