const path = require("path");
const axios = require("axios");
const StorageOptimized = require("../Models/StorageOptimazed");
const File = require("../Models/File");

const deleteAllDeletedFiles = async () => {
  try {
    // Fetch storage optimization settings
    const setting = await StorageOptimized.findOne();
    if (!setting) {
      console.log("No StorageOptimization settings found.");
      return 0;
    }

    if (!setting.enabled) {
      console.log("Optimization is disabled.");
      return 0;
    }

    // Compute cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - setting.deleteAfterDays);

    // Find all files marked as Deleted AND older than cutoff
    const oldFiles = await File.find({
      ArchivedStatus: { $regex: /^Deleted$/i },
      createdAt: { $lte: cutoffDate },
    });

    if (!oldFiles.length) {
      console.log("No deleted files found that exceed deleteAfterDays.");
      return 0;
    }

    let deletedCount = 0;

    for (const file of oldFiles) {
      try {
        // Delete file record from DB first
        await File.findByIdAndDelete(file._id);

        deletedCount++;
        console.log(` Deleted DB record for ${file.fileName} (${file._id})`);

        // Fire-and-forget: delete the actual file from Hostinger
        if (file.fileUrl) {
          const params = new URLSearchParams();
          params.append("file", file.fileUrl);

          axios
            .post(process.env.REMOVE_URL, params.toString(), {
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            })
            .then((response) => {
              if (response.data.success) {
                console.log(
                  " File deleted from Hostinger in background:",
                  file.fileUrl
                );
              } else {
                console.error(
                  " Failed to delete file from Hostinger:",
                  response.data.message
                );
              }
            })
            .catch((error) => {
              console.error(
                " Error deleting file from Hostinger:",
                error.message
              );
            });
        }
      } catch (err) {
        console.error(`Failed to delete file ${file._id}:`, err.message);
      }
    }

    console.log(`Deleted ${deletedCount} files (DB + Hostinger).`);
    return deletedCount;
  } catch (err) {
    console.error(" Error in deleteAllDeletedFiles:", err.message);
    return 0;
  }
};

module.exports = deleteAllDeletedFiles;
