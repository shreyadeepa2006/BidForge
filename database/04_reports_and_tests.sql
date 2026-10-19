-- ============================================================
-- BidForge : 04_reports_and_tests.sql
-- Report queries (JOIN, GROUP BY, HAVING, subquery), a CURSOR procedure,
-- and one test for every table's INSERT / UPDATE / DELETE / SEARCH.
-- Run after 03. Take a screenshot of each result for the report.
-- ============================================================
SET LINESIZE 200
SET PAGESIZE 100
SET SERVEROUTPUT ON
SET DEFINE OFF
COLUMN FullName FORMAT A20
COLUMN ItemName FORMAT A28
COLUMN Seller   FORMAT A20
COLUMN Category FORMAT A12

PROMPT
PROMPT ===== Q1. Top bidders: users with at least 2 accepted bids (JOIN, GROUP BY, HAVING) =====
SELECT u.UserID, u.FullName, COUNT(*) AS accepted_bids, MAX(b.BidAmount) AS highest_bid
FROM   Bids b JOIN Users u ON b.UserID = u.UserID
WHERE  b.Status = 'Accepted'
GROUP  BY u.UserID, u.FullName
HAVING COUNT(*) >= 2
ORDER  BY accepted_bids DESC, highest_bid DESC;

PROMPT
PROMPT ===== Q2. Total sales per seller (ended auctions that had a winner) =====
SELECT s.UserID, s.FullName AS Seller, COUNT(*) AS items_sold, SUM(a.CurrentHighestBid) AS total_sales
FROM   Auctions a
JOIN   Items i ON a.ItemID = i.ItemID
JOIN   Users s ON i.SellerID = s.UserID
WHERE  a.Status = 'Ended' AND a.WinningUserID IS NOT NULL
GROUP  BY s.UserID, s.FullName
ORDER  BY total_sales DESC;

PROMPT
PROMPT ===== Q3. Auctions with their item, seller, leading bidder and number of bids =====
SELECT a.AuctionID, i.ItemName, s.FullName AS Seller, w.FullName AS leading_bidder,
       a.CurrentHighestBid, a.Status,
       (SELECT COUNT(*) FROM Bids b WHERE b.AuctionID = a.AuctionID) AS total_bid_attempts
FROM   Auctions a
JOIN   Items i ON a.ItemID = i.ItemID
JOIN   Users s ON i.SellerID = s.UserID
LEFT   JOIN Users w ON a.WinningUserID = w.UserID
ORDER  BY a.AuctionID;

PROMPT
PROMPT ===== Q4. Items per category above their average starting price (subquery) =====
SELECT Category, ItemName, StartingPrice
FROM   Items i
WHERE  StartingPrice > (SELECT AVG(StartingPrice) FROM Items WHERE Category = i.Category)
ORDER  BY Category, StartingPrice DESC;

PROMPT
PROMPT ===== Q5. Users who have never placed a bid (NOT EXISTS) =====
SELECT UserID, FullName FROM Users u
WHERE  NOT EXISTS (SELECT 1 FROM Bids b WHERE b.UserID = u.UserID);

-- ---------- Procedure with a CURSOR: sales report for every seller ----------
CREATE OR REPLACE PROCEDURE seller_sales_report AS
  CURSOR c_sales IS
    SELECT u.UserID, u.FullName, COUNT(a.AuctionID) AS items_sold, SUM(a.CurrentHighestBid) AS total_sales
    FROM   Users u
    JOIN   Items i    ON i.SellerID = u.UserID
    JOIN   Auctions a ON a.ItemID   = i.ItemID
    WHERE  a.Status = 'Ended' AND a.WinningUserID IS NOT NULL
    GROUP  BY u.UserID, u.FullName
    ORDER  BY total_sales DESC;
  r c_sales%ROWTYPE;
BEGIN
  DBMS_OUTPUT.PUT_LINE(RPAD('Seller', 22) || RPAD('Items sold', 12) || 'Total sales');
  DBMS_OUTPUT.PUT_LINE(RPAD('-', 46, '-'));
  OPEN c_sales;
  LOOP
    FETCH c_sales INTO r;
    EXIT WHEN c_sales%NOTFOUND;
    DBMS_OUTPUT.PUT_LINE(RPAD(r.FullName, 22) || RPAD(TO_CHAR(r.items_sold), 12) || TO_CHAR(r.total_sales));
  END LOOP;
  CLOSE c_sales;
END;
/

PROMPT
PROMPT ===== seller_sales_report (cursor) =====
EXEC seller_sales_report

PROMPT
PROMPT ===== Functions =====
SELECT UserID, FullName, get_total_spent(UserID) AS total_spent,
       get_available_balance(UserID) AS available
FROM   Users ORDER BY total_spent DESC, UserID;
SELECT AuctionID, Status, get_highest_bid(AuctionID) AS highest_bid FROM Auctions ORDER BY AuctionID;

-- ============================================================
-- CRUD TESTS (one block per table). Each prints what happened.
-- ============================================================
PROMPT
PROMPT ===== CRUD test, USERS: insert, update, search, delete =====
DECLARE
  v_id NUMBER; v_msg VARCHAR2(200);
BEGIN
  register_user('Crud Tester', 'crud@example.com', hash_pw('x12345678'), '9000000001', 'Test lane', v_id, v_msg);
  DBMS_OUTPUT.PUT_LINE('INSERT : ' || v_msg);
  update_user(v_id, 'Crud Tester II', NULL, '9000000001', 'New address', NULL, v_msg);
  DBMS_OUTPUT.PUT_LINE('UPDATE : ' || v_msg);
  FOR r IN (SELECT UserID, FullName FROM Users WHERE LOWER(FullName) LIKE '%crud%') LOOP
    DBMS_OUTPUT.PUT_LINE('SEARCH : found ' || r.UserID || ' ' || r.FullName);
  END LOOP;
  delete_user(v_id, v_msg);
  DBMS_OUTPUT.PUT_LINE('DELETE : ' || v_msg);
  FOR r IN (SELECT UserID FROM Users WHERE Email = 'priya@example.com') LOOP
    delete_user(r.UserID, v_msg);
    DBMS_OUTPUT.PUT_LINE('DELETE a user with items (must be blocked) : ' || v_msg);
  END LOOP;
END;
/

PROMPT
PROMPT ===== CRUD test, ITEMS: insert, update, delete =====
DECLARE
  v_seller NUMBER; v_id NUMBER; v_msg VARCHAR2(200);
BEGIN
  SELECT UserID INTO v_seller FROM Users WHERE Email = 'primary@bidforge.test';
  add_item(v_seller, 'Test Ring', 'for CRUD test', 'Rings', 'Good', 5000, v_id, v_msg);
  DBMS_OUTPUT.PUT_LINE('INSERT : ' || v_msg);
  update_item(v_id, 'Test Ring (edited)', 'edited', 'Rings', 'Like New', 6000, v_msg);
  DBMS_OUTPUT.PUT_LINE('UPDATE : ' || v_msg);
  delete_item(v_id, v_msg);
  DBMS_OUTPUT.PUT_LINE('DELETE : ' || v_msg);
END;
/

PROMPT
PROMPT ===== CRUD test, AUCTIONS: insert, one-auction-per-item rule, update, delete =====
DECLARE
  v_seller NUMBER; v_item NUMBER; v_auc NUMBER; v_msg VARCHAR2(200);
BEGIN
  SELECT UserID INTO v_seller FROM Users WHERE Email = 'primary@bidforge.test';
  add_item(v_seller, 'Test Pendant', 'for CRUD test', 'Pendants', 'New', 7000, v_item, v_msg);
  create_auction(v_seller, v_item, 7000, SYSDATE, SYSDATE + 1, v_auc, v_msg);
  DBMS_OUTPUT.PUT_LINE('INSERT : ' || v_msg);
  create_auction(v_seller, v_item, 7000, SYSDATE, SYSDATE + 1, v_auc, v_msg);
  DBMS_OUTPUT.PUT_LINE('INSERT again for the same item (must be blocked) : ' || v_msg);
  SELECT AuctionID INTO v_auc FROM Auctions WHERE ItemID = v_item;
  update_auction(v_auc, 7500, SYSDATE, SYSDATE + 2, v_msg);
  DBMS_OUTPUT.PUT_LINE('UPDATE : ' || v_msg);
  delete_auction(v_auc, v_msg);
  DBMS_OUTPUT.PUT_LINE('DELETE : ' || v_msg);
  delete_item(v_item, v_msg);
END;
/

PROMPT
PROMPT ===== CRUD test, BIDS: insert, update (raise), delete (rejected only) =====
DECLARE
  v_seller NUMBER; v_bidder NUMBER; v_item NUMBER; v_auc NUMBER; v_bid NUMBER; v_msg VARCHAR2(200);
BEGIN
  -- a throw-away lot, removed again at the end so the sample data stays clean
  SELECT UserID INTO v_seller FROM Users WHERE Email = 'sana@bidforge.test';
  SELECT UserID INTO v_bidder FROM Users WHERE Email = 'primary@bidforge.test';
  add_item(v_seller, 'Test Bangle', 'for CRUD test', 'Bracelets', 'Good', 8000, v_item, v_msg);
  create_auction(v_seller, v_item, 8000, SYSDATE, SYSDATE + 1, v_auc, v_msg);

  place_bid(v_auc, v_bidder, 10, v_msg);
  DBMS_OUTPUT.PUT_LINE('INSERT (too low, stored as Rejected) : ' || v_msg);
  place_bid(v_auc, v_bidder, 8500, v_msg);
  DBMS_OUTPUT.PUT_LINE('INSERT (valid)                       : ' || v_msg);

  SELECT BidID INTO v_bid FROM Bids WHERE AuctionID = v_auc AND Status = 'Accepted';
  update_bid(v_bid, 9000, v_msg);
  DBMS_OUTPUT.PUT_LINE('UPDATE (raise to 9000)               : ' || v_msg);
  delete_bid(v_bid, v_msg);
  DBMS_OUTPUT.PUT_LINE('DELETE an accepted bid (blocked)     : ' || v_msg);

  SELECT BidID INTO v_bid FROM Bids WHERE AuctionID = v_auc AND Status = 'Rejected';
  delete_bid(v_bid, v_msg);
  DBMS_OUTPUT.PUT_LINE('DELETE a rejected bid                : ' || v_msg);

  -- clean up the throw-away lot
  DELETE FROM Bids     WHERE AuctionID = v_auc;
  DELETE FROM Auctions WHERE AuctionID = v_auc;
  DELETE FROM Items    WHERE ItemID    = v_item;
  COMMIT;
END;
/

PROMPT
PROMPT ===== CRUD test, WALLET: add, withdraw, delete, create =====
DECLARE
  v_user NUMBER; v_tx NUMBER; v_msg VARCHAR2(200);
BEGIN
  register_user('Wallet Tester', 'wallet@example.com', hash_pw('x12345678'), NULL, NULL, v_user, v_msg);
  add_money(v_user, 1000, v_msg);       DBMS_OUTPUT.PUT_LINE('UPDATE add 1000   : ' || v_msg);
  withdraw_money(v_user, 400, v_msg);   DBMS_OUTPUT.PUT_LINE('UPDATE withdraw 400: ' || v_msg);
  withdraw_money(v_user, 9999, v_msg);  DBMS_OUTPUT.PUT_LINE('withdraw too much (blocked): ' || v_msg);
  SELECT TransactionID INTO v_tx FROM Wallet WHERE UserID = v_user;
  delete_wallet(v_tx, v_msg);           DBMS_OUTPUT.PUT_LINE('DELETE with balance (blocked): ' || v_msg);
  withdraw_money(v_user, 600, v_msg);
  delete_wallet(v_tx, v_msg);           DBMS_OUTPUT.PUT_LINE('DELETE empty wallet : ' || v_msg);
  create_wallet(v_user, v_msg);         DBMS_OUTPUT.PUT_LINE('INSERT new wallet   : ' || v_msg);
  SELECT TransactionID INTO v_tx FROM Wallet WHERE UserID = v_user;
  delete_wallet(v_tx, v_msg);
  delete_user(v_user, v_msg);           DBMS_OUTPUT.PUT_LINE('clean up user       : ' || v_msg);
END;
/

PROMPT
PROMPT ===== Compile errors (should say "no rows selected") =====
SELECT name, type, line, text FROM user_errors ORDER BY name, sequence;
