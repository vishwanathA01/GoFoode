# GoFoode — SDP Project Report

## Abstract
The Multi-Restaurant Food Ordering and Delivery Platform is a web-based software application designed to simplify online food ordering. It connects customers with multiple restaurants through a centralized marketplace. Customers can browse restaurants, view menus, manage carts, place orders and track delivery progress. Restaurant owners manage restaurant profiles, menus and incoming orders. Delivery partners accept assignments and update delivery statuses. Administrators oversee users, restaurant approvals, orders, transactions and support operations.

The proposed system uses MongoDB, Express.js, React.js and Node.js. JWT authentication and role-based access control protect application routes. Socket.IO supports real-time event delivery. The design supports a multi-restaurant checkout by splitting one customer checkout into restaurant-specific orders linked by a common group identifier.

## Problem statement
Customers use fragmented restaurant channels, small restaurants may lack online reach, and manual order coordination can create delays and errors. GoFoode provides a centralized marketplace and role-specific workflows.

## Objectives
- Centralize multiple restaurants in one marketplace.
- Provide secure customer accounts and checkout.
- Enable restaurant menu and order management.
- Coordinate delivery partner assignments.
- Provide administrative oversight and reports.
- Support customer ratings and feedback.

## Modules
1. Customer portal
2. Restaurant owner portal
3. Delivery partner portal
4. Super admin portal

## Technology
React, Vite, Node.js, Express, MongoDB, Mongoose, JWT, bcryptjs, Socket.IO, Axios.

## Testing plan
- Unit testing of validation and business logic.
- API integration tests for authentication and role permissions.
- Functional tests for menu, cart, checkout and order status.
- Security tests for cross-role and cross-restaurant access.
- Responsive testing on desktop and mobile.
- Payment sandbox tests after gateway configuration.

## Future scope
AI food recommendations, voice ordering, delivery ETA prediction, loyalty points, multilingual support, mobile applications and route optimization.
