const fs = require("fs");

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readFileWithRetry(filePath, maxAttempts, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return fs.readFileSync(filePath);
    } catch (err) {
      lastError = err;
      if (
        err &&
        (err.code === "EBUSY" || err.code === "EPERM") &&
        attempt < maxAttempts
      ) {
        sleepMs(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function writeFileWithRetry(filePath, data, maxAttempts, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.writeFileSync(filePath, data);
      return;
    } catch (err) {
      lastError = err;
      if (
        err &&
        (err.code === "EBUSY" || err.code === "EPERM") &&
        attempt < maxAttempts
      ) {
        sleepMs(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function readUInt32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readUInt16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function writeUInt16LE(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset);
}

function patchSubsystem(exePath, subsystemValue) {
  const data = readFileWithRetry(exePath, 30, 100);

  if (data.length < 0x40) {
    throw new Error("Not a valid PE file (too small).");
  }

  const mz = data.toString("ascii", 0, 2);
  if (mz !== "MZ") {
    throw new Error("Not a valid PE file (missing MZ header).");
  }

  const peOffset = readUInt32LE(data, 0x3c);
  if (peOffset + 4 + 20 + 2 >= data.length) {
    throw new Error("Not a valid PE file (invalid PE header offset).");
  }

  const peSig = data.toString("ascii", peOffset, peOffset + 4);
  if (peSig !== "PE\u0000\u0000") {
    throw new Error("Not a valid PE file (missing PE signature).");
  }

  const optionalHeaderOffset = peOffset + 4 + 20;
  const magic = readUInt16LE(data, optionalHeaderOffset);
  if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error("Not a valid PE file (unknown optional header magic).");
  }

  const subsystemOffset = optionalHeaderOffset + 0x44;
  if (subsystemOffset + 2 > data.length) {
    throw new Error("Not a valid PE file (subsystem offset out of range).");
  }

  const currentSubsystem = readUInt16LE(data, subsystemOffset);
  if (currentSubsystem === subsystemValue) {
    return {
      changed: false,
      previous: currentSubsystem,
      current: currentSubsystem,
    };
  }

  writeUInt16LE(data, subsystemOffset, subsystemValue);
  writeFileWithRetry(exePath, data, 60, 100);

  return { changed: true, previous: currentSubsystem, current: subsystemValue };
}

function main() {
  const exePath = process.argv[2];
  const mode = process.argv[3] || "--gui";

  if (!exePath) {
    process.stderr.write(
      "Usage: node patch-subsystem.js <path-to-exe> [--gui|--cui]\n",
    );
    process.exit(1);
  }

  const subsystemValue = mode === "--cui" ? 3 : 2;
  const result = patchSubsystem(exePath, subsystemValue);

  const modeLabel = subsystemValue === 2 ? "GUI" : "CUI";
  if (result.changed) {
    process.stdout.write(
      `Patched ${exePath} subsystem: ${result.previous} -> ${result.current} (${modeLabel})\n`,
    );
  } else {
    process.stdout.write(
      `No change for ${exePath} (already subsystem ${result.current}, ${modeLabel})\n`,
    );
  }
}

main();
