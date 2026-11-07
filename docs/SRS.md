# Software Requirements Specification — GoFoode

## 1. Purpose
GoFoode is a web-based multi-restaurant food ordering and delivery platform connecting customers, restaurant owners, delivery partners and administrators.

## 2. Scope
The platform supports restaurant discovery, menu management, cart and checkout, restaurant-wise order processing, delivery assignments, payment records, customer reviews and platform administration.

## 3. User roles
- Customer: discover restaurants, manage cart, place and review orders.
- Restaurant owner: onboard restaurants, manage menus and process orders.
- Delivery partner: accept assignments and update delivery progress.
- Admin: approve restaurants, manage users, monitor orders and inspect platform records.

## 4. Functional requirements
1. Users can register and authenticate.
2. Customers can browse approved restaurants and available food.
3. Restaurant owners can submit restaurants for approval.
4. Admin can approve, reject or suspend restaurants.
5. Owners can manage menu items for approved restaurants they own.
6. Customers can add food items to a persistent cart.
7. Checkout groups cart lines by restaurant and creates one child order per restaurant.
8. Restaurant owners can accept, reject, prepare and mark orders ready.
9. Delivery partners can accept available assignments and update delivery status.
10. Customers can inspect order history and notifications.
11. Customers can submit reviews for delivered orders.
12. Admin can inspect users, restaurants, orders, payment records, reviews and support tickets.

## 5. Non-functional requirements
- Passwords must be hashed.
- Protected APIs must enforce role permissions and resource ownership.
- Server must validate prices and availability; never trust client totals.
- API secrets must be stored in environment variables.
- UI must be responsive on desktop and mobile.
- Error responses must not expose secrets or stack traces in production.
- Payment provider integration must verify server-side signatures and webhooks before marking payments paid.

## 6. Business rules
- Only approved restaurants are publicly listed.
- A food item belongs to one restaurant.
- A checkout can create multiple restaurant-specific orders sharing a groupOrderId.
- Each child order has its own delivery fee and order lifecycle.
- Historical order lines store a name and unit-price snapshot.
- Only a restaurant's owner can manage its menu and orders.
- Only the assigned delivery partner can update a delivery.

## 7. Constraints
Razorpay, Cloudinary, Google Maps, email and SMS require external credentials and configuration. This project provides the application foundation and local COD workflow; provider integrations must be completed and tested separately.
