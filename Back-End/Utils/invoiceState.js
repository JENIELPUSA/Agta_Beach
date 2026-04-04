const fs = require("fs");
const path = require("path");
const stateFile = path.join(__dirname, "invoiceState.json");

const readState = () => {
  if (!fs.existsSync(stateFile)) {
    return { lastPatientId: null, lastActivity: null };
  }
  return JSON.parse(fs.readFileSync(stateFile));
};

const writeState = (data) => {
  fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
};

module.exports = { readState, writeState };
