import { spawnSync } from "node:child_process";

const minimumNodeMajor = 20;
const strict = process.argv.includes("--strict");
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

const commandExists = (command) => {
  const finder = process.platform === "win32" ? "where" : "which";
  return spawnSync(finder, [command], { stdio: "ignore" }).status === 0;
};

const groups = [
  {
    label: "2D fighter and stage authoring",
    commands: ["ffmpeg", "ffprobe", "cwebp", "dwebp"],
  },
  {
    label: "3D fighter authoring",
    commands: ["blender", "jq"],
    optional: true,
  },
];

const installHints = {
  darwin: "brew install ffmpeg webp jq blender",
  linux: "Install ffmpeg, webp, jq, and Blender with your distribution's package manager.",
  win32: "Install FFmpeg, WebP tools, jq, and Blender, then add them to PATH.",
};

let failed = false;
console.log(`Node.js ${process.versions.node}`);
if (nodeMajor < minimumNodeMajor) {
  console.error(`  x Node.js ${minimumNodeMajor} or newer is required.`);
  failed = true;
} else {
  console.log(`  ok Required runtime is available.`);
}

for (const group of groups) {
  console.log(`\n${group.label}:`);
  for (const command of group.commands) {
    const available = commandExists(command);
    console.log(`  ${available ? "ok" : "--"} ${command}`);
    if (!available && strict && !group.optional) failed = true;
  }
}

console.log(`\nInstall guidance: ${installHints[process.platform] ?? installHints.linux}`);
console.log("The game and normal TypeScript work do not require the optional 3D tools.");
if (strict) console.log("Strict mode requires every 2D authoring command.");

process.exitCode = failed ? 1 : 0;
