const LogAudit = require("../Models/LogActionAudit");

const deleteOldLogAudits = async () => {
  try {
    const deleteAfterDays = 7; 
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - deleteAfterDays);

    const result = await LogAudit.deleteMany({
      createdAt: { $lt: daysAgo },
    });

    console.log(`Deleted ${result.deletedCount} old LogAudit records.`);
    return result.deletedCount;
  } catch (err) {
    console.error("Error deleting old LogAudit records:", err);
    return 0;
  }
};

module.exports = deleteOldLogAudits;
