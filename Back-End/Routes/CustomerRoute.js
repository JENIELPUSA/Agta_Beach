const express = require("express");
const router = express.Router();
const customerController = require('../Controller/CustomerController');
const authController = require('./../Controller/authController');
const upload = require("../middleware/fileUploader");

router.route('/')
    .get(authController.protect, customerController.getAllCustomers);

router.route('/Profile')
    .post(authController.protect, customerController.createCustomer);

router.route('/updateCustomerProfileAndId')
    .patch(
        authController.protect,
        upload.fields([
            { name: "avatar", maxCount: 1 },
            { name: "validIdFront", maxCount: 1 },
            { name: "validIdBack", maxCount: 1 },
        ]),
        customerController.updateCustomerProfileAndId
    );

router.route('/getProfile')
    .get(authController.protect, customerController.getProfileData);

router.route('/:id')
    .delete(authController.protect, customerController.deleteCustomer)
    .patch(authController.protect, upload.single("avatar"), customerController.updateCustomer);

module.exports = router;