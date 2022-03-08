const express = require('express');
const viewRouter = express.Router();
const viewController = require('./../controllers/viewsController');
const authController = require('./../controllers/authController');

viewRouter.get('/', authController.isLoggedIn, viewController.getOverview);
viewRouter.get(
  '/tour/:slug',
  authController.isLoggedIn,
  viewController.getTour
);
viewRouter.get(
  '/login',
  authController.isLoggedIn,
  viewController.getLoginForm
);
viewRouter.get('/signup', viewController.getSignupForm);
viewRouter.get('/me', authController.protect, viewController.getAccount);

// viewRouter.post('/me', authController.protect, viewController.updateUserData);

module.exports = viewRouter;
