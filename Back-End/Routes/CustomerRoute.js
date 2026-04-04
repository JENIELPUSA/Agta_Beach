const express = require("express");
const router = express.Router();//express router
const customerController=require('../Controller/CustomerController')
const authController = require('./../Controller/authController')
const upload = require("../middleware/fileUploader");
router.route('/')
    .get(authController.protect,customerController.getAllCustomers)
    router.route('/Profile')
    .post(authController.protect,customerController.createCustomer)


router.route('/:id')
    .delete(authController.protect,customerController.deleteCustomer)
    .patch(authController.protect, upload.single("avatar"),customerController.updateCustomer)




module.exports = router;