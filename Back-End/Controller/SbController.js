const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const SBmember = require("../Models/SBmember");
const UserLoginSchema = require("../Models/LogInDentalSchema");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
exports.createSBmember = AsyncErrorHandler(async (req, res) => {
  const newSBmember = await SBmember.create(req.body);

  res.status(201).json({
    status: "success",
    message: "SB member created successfully.",
    data: newSBmember,
  });
});

exports.DisplaySBmember = AsyncErrorHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const { search = "", dateFrom, dateTo } = req.query;
    const matchStage = {};
    const hasDateFrom = dateFrom && dateFrom.trim() !== "";
    const hasDateTo = dateTo && dateTo.trim() !== "";

    if (hasDateFrom || hasDateTo) {
      matchStage.created_at = {};

      if (hasDateFrom) {
        matchStage.created_at.$gte = new Date(dateFrom);
      }

      if (hasDateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        matchStage.created_at.$lt = endDate;
      }
    }

    const pipeline = [
      {
        $addFields: {
          full_name: {
            $concat: [
              { $ifNull: ["$first_name", ""] },
              " ",
              { $ifNull: ["$middle_name", ""] },
              " ",
              { $ifNull: ["$last_name", ""] },
            ],
          },
        },
      },
      {
        $match: {
          ...matchStage,
          ...(search.trim()
            ? {
                full_name: {
                  $regex: new RegExp(search.trim(), "i"),
                },
              }
            : {}),
        },
      },
      {
        $sort: { created_at: -1 },
      },
      {
        $project: {
          _id: 1,
          avatar: 1,
          first_name: 1,
          middle_name: 1,
          last_name: 1,
          detailInfo: 1,
          term_from: 1,
          term_to: 1,
          email: 1,
          Position: 1,
          created_at: 1,
          full_name: 1,
        },
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const results = await SBmember.aggregate(pipeline);

    const data = results[0].data;
    const totalSBmember = results[0].totalCount[0]?.count || 0;

    res.status(200).json({
      status: "success",
      data,
      totalSBmember,
      currentPage: page,
      totalPages: Math.ceil(totalSBmember / limit),
    });
  } catch (error) {
    console.error("Error fetching SB members:", error);
    res.status(500).json({
      status: "fail",
      message: "Something went wrong while fetching SB members.",
      error: error.message,
    });
  }
});

exports.DisplaySBmemberInDropdown = AsyncErrorHandler(async (req, res) => {
  try {
    const { search = "" } = req.query;

    const pipeline = [
      {
        $addFields: {
          full_name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$first_name", ""] },
                  " ",
                  { $ifNull: ["$middle_name", ""] },
                  " ",
                  { $ifNull: ["$last_name", ""] },
                ],
              },
            },
          },
        },
      },
      ...(search.trim()
        ? [
            {
              $match: {
                full_name: { $regex: new RegExp(search.trim(), "i") },
              },
            },
          ]
        : []),
      // --- Group by first, middle, last name to remove duplicates ---
      {
        $group: {
          _id: { first_name: "$first_name", middle_name: "$middle_name", last_name: "$last_name" },
          full_name: { $first: "$full_name" },
          Position: { $first: "$Position" },
        },
      },
      {
        $sort: { full_name: 1 },
      },
      {
        $project: {
          _id: 1,
          full_name: 1,
          Position: 1,
        },
      },
    ];

    const members = await SBmember.aggregate(pipeline);

    res.status(200).json({
      status: "success",
      data: members,
      totalMembers: members.length,
    });
  } catch (error) {
    console.error("Error fetching all SB members:", error);
    res.status(500).json({
      status: "fail",
      message: "Something went wrong while fetching all SB members.",
      error: error.message,
    });
  }
});


exports.UpdateSBmember = AsyncErrorHandler(async (req, res, next) => {
  const SbmemberID = req.params.id;

  const oldRecord = await SBmember.findById(SbmemberID);
  if (!oldRecord) {
    return res.status(404).json({ error: "SB Member not found" });
  }

  let newAvatarUrl = oldRecord.avatar ? oldRecord.avatar.url : null;
  const oldAvatarUrl = oldRecord.avatar ? oldRecord.avatar.url : null;

  if (req.file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Failed to delete invalid temp file:", err);
      });
      return res.status(400).json({ error: "Invalid image type" });
    }

    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const uploadResponse = await axios.post(
        process.env.UPLOAD_URL,
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
        }
      );

      if (!uploadResponse.data.success) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Failed to delete temp file:", err);
        });
        return res.status(500).json({
          error: uploadResponse.data.message || "Failed to upload new avatar",
        });
      }

      newAvatarUrl = uploadResponse.data.url;
      console.log("New avatar uploaded to Hostinger:", newAvatarUrl);
    } catch (error) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Failed to delete temp file:", err);
      });
      console.error("Error during avatar upload:", error.message);
      return res.status(500).json({
        error: "Failed to upload new avatar due to a server error.",
      });
    } finally {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Failed to delete temp file:", err);
      });
    }
  }

  const updateData = {
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    middle_name: req.body.middle_name,
    term_to: req.body.term_to,
    district: req.body.district,
    term_from: req.body.term_from,
    term: req.body.term,
    email: req.body.email,
    Position: req.body.Position,
    detailInfo: req.body.detailInfo,
  };

  if (req.file) {
    updateData.avatar = {
      ...oldRecord.avatar,
      url: newAvatarUrl,
    };
  }

  const updatedSBmember = await SBmember.findByIdAndUpdate(
    SbmemberID,
    updateData,
    {
      new: true,
    }
  );

  if (!updatedSBmember) {
    return res.status(404).json({
      error: "SB Member not found after update, rollback not possible.",
    });
  }

  res.json({
    status: "success",
    data: updatedSBmember,
  });

  if (req.file && oldAvatarUrl) {
    const params = new URLSearchParams();
    params.append("file", oldAvatarUrl);

    axios
      .post(
        process.env.REMOVE_URL,
        params.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      )
      .then((response) => {
        if (response.data.success) {
          console.log("Old news image deleted in background:", oldAvatarUrl);
        } else {
          console.error(
            "Failed to delete old news image in background:",
            response.data.message
          );
        }
      })
      .catch((error) => {
        console.error(
          "Error deleting old news image in background:",
          error.message
        );
      });
  }
});

exports.deleteSBmember = AsyncErrorHandler(async (req, res, next) => {
  const SbmemberID = req.params.id;

  const existingSB = await SBmember.findById(SbmemberID);
  if (!existingSB) {
    return res.status(404).json({
      status: "fail",
      message: "SB member not found.",
    });
  }



  const avatarUrlToDelete = existingSB.avatar?.url;
  const userLogin = await UserLoginSchema.findOne({ linkedId: SbmemberID });
  if (userLogin) {
    await UserLoginSchema.findByIdAndDelete(userLogin._id);
  }

  await SBmember.findByIdAndDelete(SbmemberID);

  res.status(200).json({
    status: "success",
    message: "SB member and related login deleted successfully.",
  });

  // Hakbang 3: "Fire and Forget" - I-delete ang avatar file sa background.
  if (avatarUrlToDelete) {
    const params = new URLSearchParams();
    params.append("file", avatarUrlToDelete);

    axios
      .post(
        process.env.REMOVE_URL,
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
      .then((response) => {
        if (response.data.success) {
          console.log(
            "✅ Avatar deleted from Hostinger in background:",
            avatarUrlToDelete
          );
        } else {
          console.error(
            "❌ Failed to delete avatar from Hostinger in background:",
            response.data.message
          );
        }
      })
      .catch((error) => {
        console.error(
          "❌ Error deleting avatar from Hostinger in background:",
          error.message
        );
      });
  }
});

exports.getAllAuthorsWithFiles = AsyncErrorHandler(async (req, res, next) => {
  const { search } = req.query;
  const aggregationPipeline = [
    {
      $lookup: {
        from: "files",
        localField: "_id",
        foreignField: "author",
        as: "files",
      },
    },
    {
      $unwind: {
        path: "$files",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "files.category",
        foreignField: "_id",
        as: "categoryInfo",
      },
    },
    {
      $unwind: {
        path: "$categoryInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        fullName: {
          $concat: [
            "$first_name",
            " ",
            { $ifNull: ["$middle_name", ""] },
            " ",
            "$last_name",
          ],
        },
        "files.categoryName": "$categoryInfo.category",
      },
    },
    ...(search
      ? [
          {
            $match: {
              $or: [
                {
                  $or: [
                    { first_name: { $regex: search, $options: "i" } },
                    { middle_name: { $regex: search, $options: "i" } },
                    { last_name: { $regex: search, $options: "i" } },
                  ],
                },
                {
                  fullName: { $regex: search, $options: "i" },
                },
              ],
            },
          },
        ]
      : []),
    {
      $group: {
        _id: "$_id",
        fullName: { $first: "$fullName" },
        memberInfo: { $first: "$$ROOT" },
        files: {
          $push: {
            _id: "$files._id",
            title: "$files.title",
            summary: "$files.summary",
            category: "$categoryInfo.category",
            createdAt: "$files.createdAt",
            status: "$files.status",
            filePath: "$files.filePath",
            resolutionNo: "$files.ResolutionNo",
            dateOfResolution: "$files.dateOfResolution",
            resolutionNumber: "$files.resolutionNumber",
          },
        },
        count: {
          $sum: {
            $cond: [{ $ifNull: ["$files._id", false] }, 1, 0],
          },
        },
        resolutionCount: {
          $sum: {
            $cond: [{ $eq: ["$categoryInfo.category", "Resolution"] }, 1, 0],
          },
        },
        ordinanceCount: {
          $sum: {
            $cond: [{ $eq: ["$categoryInfo.category", "Ordinance"] }, 1, 0],
          },
        },
      },
    },
    {
      $sort: { fullName: 1 },
    },
  ];

  const AuthorsWithFiles = await SBmember.aggregate(
    aggregationPipeline
  ).allowDiskUse(true);

  const totalCount = AuthorsWithFiles.length;

  const limit = parseInt(req.query.limit) || 6;
  const currentPage = parseInt(req.query.page) || 1;
  const totalPages = Math.ceil(totalCount / limit);

  const startIndex = (currentPage - 1) * limit;
  const endIndex = currentPage * limit;
  const paginatedData = AuthorsWithFiles.slice(startIndex, endIndex);

  res.status(200).json({
    status: "success",
    currentPage,
    totalPages,
    data: paginatedData,
  });
});
