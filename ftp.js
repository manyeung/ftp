const fs = require("fs");
const path = require("path");
const FtpClient = require("ftp");
const { promisify } = require("util");

require('dotenv').config()

const doFtp = async () => {
  const config = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
  };

  const srcBasePath = path.join(__dirname, "build");
  const destBasePath = process.env.FTP_PATH;

  const actions = [];

  const prepare = async (src) => {
    const readDir = promisify(fs.readdir);

    try {
      const list = await readDir(src);
      actions.push(["mkdir", src]);
      while (list.length) {
        await prepare(path.join(src, list.shift()));
      }
    } catch (err) {
      actions.push(["put", src]);
    }
  };
  await prepare(srcBasePath);
  actions.splice(0, 1);

  return new Promise((resolve) => {
    const client = new FtpClient();

    client.on("ready", async () => {
      console.log("FTP ready");

      const upload = () => {
        const doAction = (cb) => {
          if (!actions.length) {
            cb();
            return;
          }

          const [action, src] = actions.shift();
          console.log(action + " " + src);
          const dest = src
            .replace(srcBasePath, destBasePath)
            .replace(/\\/g, "/");

          let tid = setTimeout(() => {
            console.log("FTP timeout");
            actions.unshift([action, src]);
            client.destroy();

            console.log("FTP connect in 5s");
            setTimeout(() => {
              client.connect(config);
            }, 5000);
          }, 5000);

          const handleActionDone = (err) => {
            if (err) {
              console.log("skip: " + err.toString());
            }
            clearTimeout(tid);
            doAction(cb);
          };

          if (action === "mkdir") {
            client.mkdir(dest, handleActionDone);
          }

          if (action === "put") {
            client.put(src, dest, handleActionDone);
          }
        };

        return new Promise((resolve) => {
          doAction(resolve);
        });
      };
      await upload();

      console.log("FTP end");
      client.end();
      resolve();
    });

    client.connect(config);
  });
};

doFtp()