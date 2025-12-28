import apnic from "./apnic.js";
import process from "node:process";

if (!process.argv[2]) {
  console.log("Please specify an IP address");
  process.exit();
}

console.log(await apnic(process.argv[2]));
