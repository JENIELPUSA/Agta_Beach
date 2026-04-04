const express = require('express');
const router = express.Router();//express router
const userController = require('./../Controller/userController')
const authController = require('./../Controller/authController')

router.route('/')
    .get(userController.DisplayAll)
    .post(authController.protect,userController.createUser)
    

router.route('/:id')
    .delete(authController.protect,authController.restrict('Admin'),userController.deleteUser)
    .patch(authController.protect,authController.restrict('Admin'),userController.Updateuser)
    .get(authController.protect,authController.restrict('Admin'),userController.Getiduser)
router.route('/updatePassword').patch(
        authController.protect,authController.restrict('Admin'),
        userController.updatePassword
)
    
module.exports=router
