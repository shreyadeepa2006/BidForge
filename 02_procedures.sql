-- ============================================================
-- BidForge : 02_procedures.sql
-- Run AFTER 01_schema.sql.
-- All business rules live here, in Oracle. Every table has procedures for
--   INSERT (create), UPDATE, DELETE   (search / retrieve are SELECTs in app.py)
-- If you see "created with compilation errors", type:  SHOW ERRORS
-- Procedures return p_result as 'SUCCESS: ...' or 'FAILED: ...'.
-- ============================================================
SET DEFINE OFF
SET SERVEROUTPUT ON

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- SHA-256 of a password (Flask hashes the same way before calling register / login)
CREATE OR REPLACE FUNCTION hash_pw (p_text IN VARCHAR2) RETURN VARCHAR2 AS
  v_hash VARCHAR2(64);
BEGIN
  SELECT LOWER(RAWTOHEX(STANDARD_HASH(p_text, 'SHA256'))) INTO v_hash FROM dual;
  RETURN v_hash;
END;
/

-- Smallest allowed raise over the current highest bid
CREATE OR REPLACE FUNCTION min_increment (p_current IN NUMBER) RETURN NUMBER AS
BEGIN
  IF p_current < 10000 THEN RETURN 100;
  ELSIF p_current < 100000 THEN RETURN 500;
  ELSE RETURN 1000;
  END IF;
END;
/

-- Highest bid of one auction
CREATE OR REPLACE FUNCTION get_highest_bid (p_auction_id IN NUMBER) RETURN NUMBER AS
  v_amount NUMBER;
BEGIN
  SELECT CurrentHighestBid INTO v_amount FROM Auctions WHERE AuctionID = p_auction_id;
  RETURN v_amount;
EXCEPTION
  WHEN NO_DATA_FOUND THEN RETURN NULL;
END;
/

-- Total money a user has spent (winning price of every ENDED auction they won)
CREATE OR REPLACE FUNCTION get_total_spent (p_user_id IN NUMBER) RETURN NUMBER AS
  v_total NUMBER;
BEGIN
  SELECT NVL(SUM(CurrentHighestBid), 0) INTO v_total
  FROM   Auctions
  WHERE  WinningUserID = p_user_id AND Status = 'Ended';
  RETURN v_total;
END;
/

-- Money "held" because the user is the highest bidder on live auctions
-- (optionally ignoring one auction). Stops one balance being promised twice.
CREATE OR REPLACE FUNCTION get_held_amount (
  p_user_id        IN NUMBER,
  p_except_auction IN NUMBER DEFAULT NULL
) RETURN NUMBER AS
  v_held NUMBER;
BEGIN
  SELECT NVL(SUM(CurrentHighestBid), 0) INTO v_held
  FROM   Auctions
  WHERE  Status = 'Live'
  AND    WinningUserID = p_user_id
  AND    EndTime > SYSDATE
  AND    (p_except_auction IS NULL OR AuctionID <> p_except_auction);
  RETURN v_held;
END;
/

-- Wallet balance minus held money
CREATE OR REPLACE FUNCTION get_available_balance (
  p_user_id        IN NUMBER,
  p_except_auction IN NUMBER DEFAULT NULL
) RETURN NUMBER AS
  v_balance NUMBER;
BEGIN
  SELECT WalletBalance INTO v_balance FROM Users WHERE UserID = p_user_id;
  RETURN v_balance - get_held_amount(p_user_id, p_except_auction);
EXCEPTION
  WHEN NO_DATA_FOUND THEN RETURN NULL;
END;
/

-- ============================================================
-- VIEW used by the website (needs min_increment, so it lives here)
-- ============================================================
CREATE OR REPLACE VIEW v_auction_detail AS
SELECT a.AuctionID, a.ItemID, a.WinningUserID, a.StartingPrice, a.CurrentHighestBid,
       a.StartTime, a.EndTime, a.Status,
       i.SellerID, i.ItemName, i.Description, i.Category, i.Condition,
       i.StartingPrice AS ItemStartingPrice, i.CreatedAt,
       s.FullName AS SellerFullName,
       w.FullName AS WinnerFullName,
       (SELECT COUNT(*) FROM Bids b
         WHERE b.AuctionID = a.AuctionID AND b.Status = 'Accepted') AS BidCount,
       CASE WHEN a.Status = 'Cancelled' THEN 'cancelled'
            WHEN a.Status = 'Ended'     THEN 'ended'
            WHEN a.StartTime > SYSDATE  THEN 'upcoming'
            ELSE 'live' END AS Phase,
       min_increment(a.CurrentHighestBid) AS MinRaise,
       CASE WHEN a.WinningUserID IS NULL
            THEN a.StartingPrice
            ELSE a.CurrentHighestBid + min_increment(a.CurrentHighestBid) END AS MinNextBid
FROM   Auctions a
JOIN   Items i      ON a.ItemID   = i.ItemID
JOIN   Users s      ON i.SellerID = s.UserID
LEFT   JOIN Users w ON a.WinningUserID = w.UserID;

-- ============================================================
-- WALLET helper: moves money in/out of a user's wallet and keeps
-- Users.WalletBalance and the Wallet row in sync. (Caller COMMITs.)
-- ============================================================
CREATE OR REPLACE PROCEDURE apply_wallet_txn (
  p_user_id IN NUMBER,
  p_amount  IN NUMBER,
  p_type    IN VARCHAR2          -- 'Credit' or 'Debit'
) AS
BEGIN
  IF p_type = 'Credit' THEN
    UPDATE Users SET WalletBalance = WalletBalance + p_amount WHERE UserID = p_user_id;
  ELSE
    UPDATE Users SET WalletBalance = WalletBalance - p_amount WHERE UserID = p_user_id;
  END IF;

  UPDATE Wallet
  SET    WalletBalance   = (SELECT WalletBalance FROM Users WHERE UserID = p_user_id),
         TransactionType = p_type,
         TransactionDate = SYSDATE,
         Status          = 'Success'
  WHERE  UserID = p_user_id;

  IF SQL%ROWCOUNT = 0 THEN        -- the user had no wallet row: create it
    INSERT INTO Wallet (TransactionID, UserID, WalletBalance, TransactionType, TransactionDate, Status)
    VALUES (wallet_seq.NEXTVAL, p_user_id,
            (SELECT WalletBalance FROM Users WHERE UserID = p_user_id), p_type, SYSDATE, 'Success');
  END IF;
END;
/

-- ============================================================
-- USERS : insert, login, update, delete
-- ============================================================
CREATE OR REPLACE PROCEDURE register_user (
  p_name     IN  VARCHAR2,
  p_email    IN  VARCHAR2,
  p_password IN  VARCHAR2,
  p_phone    IN  VARCHAR2,
  p_address  IN  VARCHAR2,
  p_user_id  OUT NUMBER,
  p_result   OUT VARCHAR2
) AS
BEGIN
  p_user_id := users_seq.NEXTVAL;
  INSERT INTO Users (UserID, FullName, Email, Password, PhoneNo, Address)
  VALUES (p_user_id, p_name, p_email, p_password, p_phone, p_address);
  COMMIT;
  p_result := 'SUCCESS: User registered';
EXCEPTION
  WHEN DUP_VAL_ON_INDEX THEN
    ROLLBACK;
    p_user_id := NULL;
    p_result  := 'FAILED: Email or phone number already registered';
END;
/

CREATE OR REPLACE PROCEDURE login_user (
  p_email    IN  VARCHAR2,
  p_password IN  VARCHAR2,
  p_user_id  OUT NUMBER,
  p_result   OUT VARCHAR2
) AS
BEGIN
  SELECT UserID INTO p_user_id FROM Users WHERE Email = p_email AND Password = p_password;
  p_result := 'SUCCESS: Login OK';
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    p_user_id := NULL;
    p_result  := 'FAILED: Wrong email or password';
END;
/

-- UPDATE a user. A NULL p_email or p_password means "keep the current one".
CREATE OR REPLACE PROCEDURE update_user (
  p_user_id  IN  NUMBER,
  p_name     IN  VARCHAR2,
  p_email    IN  VARCHAR2,
  p_phone    IN  VARCHAR2,
  p_address  IN  VARCHAR2,
  p_password IN  VARCHAR2,
  p_result   OUT VARCHAR2
) AS
BEGIN
  UPDATE Users
  SET    FullName = p_name,
         Email    = NVL(p_email, Email),
         PhoneNo  = p_phone,
         Address  = p_address,
         Password = NVL(p_password, Password)
  WHERE  UserID = p_user_id;

  IF SQL%ROWCOUNT = 0 THEN
    p_result := 'FAILED: User not found';
  ELSE
    COMMIT;
    p_result := 'SUCCESS: User updated';
  END IF;
EXCEPTION
  WHEN DUP_VAL_ON_INDEX THEN
    ROLLBACK;
    p_result := 'FAILED: That email or phone number belongs to another account.';
END;
/

-- DELETE a user (the trigger trg_protect_user_delete blocks users with items or bids)
CREATE OR REPLACE PROCEDURE delete_user (
  p_user_id IN  NUMBER,
  p_result  OUT VARCHAR2
) AS
BEGIN
  DELETE FROM Users WHERE UserID = p_user_id;
  IF SQL%ROWCOUNT = 0 THEN
    p_result := 'FAILED: User not found';
  ELSE
    COMMIT;
    p_result := 'SUCCESS: User deleted';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    IF SQLCODE = -20010 THEN
      p_result := 'FAILED: Cannot delete this user, they have items or bids.';
    ELSE
      p_result := 'FAILED: ' || SQLERRM;
    END IF;
END;
/

-- ============================================================
-- WALLET : create, add money, withdraw, delete
-- ============================================================
-- CREATE a wallet row for a user who has none (normally the trigger does this)
CREATE OR REPLACE PROCEDURE create_wallet (
  p_user_id IN  NUMBER,
  p_result  OUT VARCHAR2
) AS
  v_users   NUMBER;
  v_wallets NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_users   FROM Users  WHERE UserID = p_user_id;
  SELECT COUNT(*) INTO v_wallets FROM Wallet WHERE UserID = p_user_id;

  IF v_users = 0 THEN
    p_result := 'FAILED: User not found';
  ELSIF v_wallets > 0 THEN
    p_result := 'FAILED: This user already has a wallet (one wallet per user)';
  ELSE
    INSERT INTO Wallet (TransactionID, UserID, WalletBalance)
    VALUES (wallet_seq.NEXTVAL, p_user_id, (SELECT WalletBalance FROM Users WHERE UserID = p_user_id));
    COMMIT;
    p_result := 'SUCCESS: Wallet created';
  END IF;
END;
/

-- UPDATE the wallet: add money (Credit)
CREATE OR REPLACE PROCEDURE add_money (
  p_user_id IN  NUMBER,
  p_amount  IN  NUMBER,
  p_result  OUT VARCHAR2
) AS
  v_count NUMBER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    p_result := 'FAILED: Amount must be greater than 0';
    RETURN;
  END IF;
  SELECT COUNT(*) INTO v_count FROM Users WHERE UserID = p_user_id;
  IF v_count = 0 THEN
    p_result := 'FAILED: User not found';
    RETURN;
  END IF;
  apply_wallet_txn(p_user_id, p_amount, 'Credit');
  COMMIT;
  p_result := 'SUCCESS: Money added';
END;
/

-- Add money, or record a failed payment (the Wallet.Status = 'Failed' case)
CREATE OR REPLACE PROCEDURE add_money_ex (
  p_user_id IN  NUMBER,
  p_amount  IN  NUMBER,
  p_outcome IN  VARCHAR2,          -- 'Success' or 'Failed'
  p_result  OUT VARCHAR2
) AS
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    p_result := 'FAILED: Amount must be greater than 0';
    RETURN;
  END IF;

  IF p_outcome = 'Failed' THEN
    UPDATE Wallet
    SET    TransactionType = 'Credit', TransactionDate = SYSDATE, Status = 'Failed'
    WHERE  UserID = p_user_id;
    COMMIT;
    p_result := 'FAILED: The payment failed, so your balance did not change.';
  ELSE
    add_money(p_user_id, p_amount, p_result);
  END IF;
END;
/

-- UPDATE the wallet: withdraw money (Debit), only from the available balance
CREATE OR REPLACE PROCEDURE withdraw_money (
  p_user_id IN  NUMBER,
  p_amount  IN  NUMBER,
  p_result  OUT VARCHAR2
) AS
  v_available NUMBER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    p_result := 'FAILED: Amount must be greater than 0';
    RETURN;
  END IF;
  v_available := get_available_balance(p_user_id);
  IF v_available IS NULL THEN
    p_result := 'FAILED: User not found';
  ELSIF p_amount > v_available THEN
    p_result := 'FAILED: Available balance is only Rs ' || TO_CHAR(FLOOR(v_available), 'FM9999999990');
  ELSE
    apply_wallet_txn(p_user_id, p_amount, 'Debit');
    COMMIT;
    p_result := 'SUCCESS: Money withdrawn';
  END IF;
END;
/

-- DELETE a wallet row (only when its balance is zero)
CREATE OR REPLACE PROCEDURE delete_wallet (
  p_transaction_id IN  NUMBER,
  p_result         OUT VARCHAR2
) AS
  v_user    NUMBER;
  v_balance NUMBER;
BEGIN
  SELECT w.UserID, u.WalletBalance INTO v_user, v_balance
  FROM   Wallet w JOIN Users u ON u.UserID = w.UserID
  WHERE  w.TransactionID = p_transaction_id;

  IF v_balance > 0 THEN
    p_result := 'FAILED: This wallet still holds Rs ' || TO_CHAR(v_balance) || '. Withdraw it first.';
  ELSE
    DELETE FROM Wallet WHERE TransactionID = p_transaction_id;
    COMMIT;
    p_result := 'SUCCESS: Wallet deleted';
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    p_result := 'FAILED: Wallet not found';
END;
/

-- ============================================================
-- ITEMS : insert, update, delete
-- ============================================================
CREATE OR REPLACE PROCEDURE add_item (
  p_seller_id IN  NUMBER,
  p_name      IN  VARCHAR2,
  p_desc      IN  VARCHAR2,
  p_category  IN  VARCHAR2,
  p_condition IN  VARCHAR2,
  p_price     IN  NUMBER,
  p_item_id   OUT NUMBER,
  p_result    OUT VARCHAR2
) AS
BEGIN
  p_item_id := items_seq.NEXTVAL;
  INSERT INTO Items (ItemID, SellerID, ItemName, Description, Category, Condition, StartingPrice)
  VALUES (p_item_id, p_seller_id, p_name, p_desc, p_category, p_condition, p_price);
  COMMIT;
  p_result := 'SUCCESS: Item added';
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    p_item_id := NULL;
    p_result  := 'FAILED: ' || SQLERRM;
END;
/

-- UPDATE an item. Its price can only change while it has no auction
-- (once an auction exists, edit the auction's starting price instead).
CREATE OR REPLACE PROCEDURE update_item (
  p_item_id   IN  NUMBER,
  p_name      IN  VARCHAR2,
  p_desc      IN  VARCHAR2,
  p_category  IN  VARCHAR2,
  p_condition IN  VARCHAR2,
  p_price     IN  NUMBER,
  p_result    OUT VARCHAR2
) AS
  v_old_price NUMBER;
  v_auctions  NUMBER;
BEGIN
  SELECT StartingPrice INTO v_old_price FROM Items WHERE ItemID = p_item_id;
  SELECT COUNT(*) INTO v_auctions FROM Auctions WHERE ItemID = p_item_id;

  IF v_auctions > 0 AND p_price <> v_old_price THEN
    p_result := 'FAILED: This item already has an auction, so its price cannot change here. Edit the auction instead.';
    RETURN;
  END IF;

  UPDATE Items
  SET    ItemName = p_name, Description = p_desc, Category = p_category,
         Condition = p_condition, StartingPrice = p_price
  WHERE  ItemID = p_item_id;
  COMMIT;
  p_result := 'SUCCESS: Item updated';
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    p_result := 'FAILED: Item not found';
  WHEN OTHERS THEN
    ROLLBACK;
    p_result := 'FAILED: ' || SQLERRM;
END;
/

-- DELETE an item (only if it has no auction)
CREATE OR REPLACE PROCEDURE delete_item (
  p_item_id IN  NUMBER,
  p_result  OUT VARCHAR2
) AS
  v_auctions NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_auctions FROM Auctions WHERE ItemID = p_item_id;
  IF v_auctions > 0 THEN
    p_result := 'FAILED: This item has an auction. Delete the auction first.';
    RETURN;
  END IF;

  DELETE FROM Items WHERE ItemID = p_item_id;
  IF SQL%ROWCOUNT = 0 THEN
    p_result := 'FAILED: Item not found';
  ELSE
    COMMIT;
    p_result := 'SUCCESS: Item deleted';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    p_result := 'FAILED: ' || SQLERRM;
END;
/

-- ============================================================
-- AUCTIONS : insert, update, cancel, delete, close
-- ============================================================
-- INSERT an auction. ER rule: one item has exactly one auction.
CREATE OR REPLACE PROCEDURE create_auction (
  p_user_id    IN  NUMBER,
  p_item_id    IN  NUMBER,
  p_price      IN  NUMBER,
  p_start      IN  DATE,
  p_end        IN  DATE,
  p_auction_id OUT NUMBER,
  p_result     OUT VARCHAR2
) AS
  v_seller NUMBER;
  v_count  NUMBER;
  v_start  DATE;
BEGIN
  SELECT SellerID INTO v_seller FROM Items WHERE ItemID = p_item_id;

  IF v_seller <> p_user_id THEN
    p_result := 'FAILED: Choose one of your own items.';
    RETURN;
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    p_result := 'FAILED: Starting price must be greater than 0.';
    RETURN;
  END IF;

  v_start := GREATEST(p_start, SYSDATE);          -- a start in the past means "now"
  IF p_end <= v_start THEN
    p_result := 'FAILED: The end time must be after the start time.';
    RETURN;
  END IF;
  IF (p_end - v_start) * 1440 < 15 THEN
    p_result := 'FAILED: An auction must run for at least 15 minutes.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count FROM Auctions WHERE ItemID = p_item_id;
  IF v_count > 0 THEN
    p_result := 'FAILED: This item already has an auction (one auction per item).';
    RETURN;
  END IF;

  p_auction_id := auctions_seq.NEXTVAL;
  INSERT INTO Auctions (AuctionID, ItemID, StartingPrice, CurrentHighestBid, StartTime, EndTime, Status)
  VALUES (p_auction_id, p_item_id, p_price, p_price, v_start, p_end, 'Live');

  COMMIT;
  p_result := 'SUCCESS: Auction created';
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    p_auction_id := NULL;
    p_result := 'FAILED: Item not found.';
  WHEN DUP_VAL_ON_INDEX THEN
    ROLLBACK;
    p_auction_id := NULL;
    p_result := 'FAILED: This item already has an auction (one auction per item).';
END;
/

-- UPDATE an auction's starting price and times (only while Live and without bids)
CREATE OR REPLACE PROCEDURE update_auction (
  p_auction_id IN  NUMBER,
  p_price      IN  NUMBER,
  p_start      IN  DATE,
  p_end        IN  DATE,
  p_result     OUT VARCHAR2
) AS
  v_auction Auctions%ROWTYPE;
  v_start   DATE;
BEGIN
  SELECT * INTO v_auction FROM Auctions WHERE AuctionID = p_auction_id FOR UPDATE;

  IF v_auction.Status <> 'Live' THEN
    p_result := 'FAILED: Only a live auction can be edited.';
  ELSIF v_auction.WinningUserID IS NOT NULL THEN
    p_result := 'FAILED: This auction already has bids and cannot be edited.';
  ELSIF p_price IS NULL OR p_price <= 0 THEN
    p_result := 'FAILED: Starting price must be greater than 0.';
  ELSE
    v_start := GREATEST(p_start, SYSDATE);
    IF p_end <= v_start THEN
      p_result := 'FAILED: The end time must be after the start time.';
    ELSIF (p_end - v_start) * 1440 < 15 THEN
      p_result := 'FAILED: An auction must run for at least 15 minutes.';
    ELSE
      UPDATE Auctions
      SET    StartingPrice = p_price, CurrentHighestBid = p_price,
             StartTime = v_start, EndTime = p_end
      WHERE  AuctionID = p_auction_id;
      p_result := 'SUCCESS: Auction updated';
    END IF;
  END IF;
  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    p_result := 'FAILED: Auction not found';
END;
/

-- UPDATE an auction's Status to Cancelled (only its seller, only while Live, only with no bids)
CREATE OR REPLACE PROCEDURE cancel_auction (
  p_auction_id IN  NUMBER,
  p_user_id    IN  NUMBER,
  p_result     OUT VARCHAR2
) AS
  v_auction Auctions%ROWTYPE;
  v_seller  NUMBER;
BEGIN
  SELECT * INTO v_auction FROM Auctions WHERE AuctionID = p_auction_id FOR UPDATE;
  SELECT SellerID INTO v_seller FROM Items WHERE ItemID = v_auction.ItemID;

  IF v_auction.Status <> 'Live' THEN
    p_result := 'FAILED: Only a live auction can be cancelled';
  ELSIF v_seller <> p_user_id THEN
    p_result := 'FAILED: Only the seller can cancel this auction';
  ELSIF v_auction.WinningUserID IS NOT NULL THEN
    p_result := 'FAILED: Auction already has bids';
  ELSE
    UPDATE Auctions SET Status = 'Cancelled' WHERE AuctionID = p_auction_id;
    p_result := 'SUCCESS: Auction cancelled';
  END IF;
  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    p_result := 'FAILED: Auction not found';
END;
/

-- DELETE an auction (not if it has accepted bids; its rejected bids are removed with it)
CREATE OR REPLACE PROCEDURE delete_auction (
  p_auction_id IN  NUMBER,
  p_result     OUT VARCHAR2
) AS
  v_accepted NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_accepted FROM Bids WHERE AuctionID = p_auction_id AND Status = 'Accepted';
  IF v_accepted > 0 THEN
    p_result := 'FAILED: This auction has accepted bids, so it is part of the history and cannot be deleted.';
    RETURN;
  END IF;

  DELETE FROM Bids     WHERE AuctionID = p_auction_id;     -- only Rejected ones remain
  DELETE FROM Auctions WHERE AuctionID = p_auction_id;
  IF SQL%ROWCOUNT = 0 THEN
    ROLLBACK;
    p_result := 'FAILED: Auction not found';
  ELSE
    COMMIT;
    p_result := 'SUCCESS: Auction deleted';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    p_result := 'FAILED: ' || SQLERRM;
END;
/

-- CLOSE an auction after its end time: the winner pays, the seller is paid
CREATE OR REPLACE PROCEDURE close_auction (
  p_auction_id IN  NUMBER,
  p_result     OUT VARCHAR2
) AS
  v_auction Auctions%ROWTYPE;
  v_seller  NUMBER;
  v_balance NUMBER;
BEGIN
  SELECT * INTO v_auction FROM Auctions WHERE AuctionID = p_auction_id FOR UPDATE;

  IF v_auction.Status <> 'Live' THEN
    p_result := 'FAILED: Auction is already ' || v_auction.Status;

  ELSIF SYSDATE < v_auction.EndTime THEN
    p_result := 'FAILED: Auction has not reached its end time';

  ELSIF v_auction.WinningUserID IS NULL THEN
    UPDATE Auctions SET Status = 'Ended' WHERE AuctionID = p_auction_id;
    p_result := 'ENDED: No bids were placed';

  ELSE
    SELECT SellerID INTO v_seller FROM Items WHERE ItemID = v_auction.ItemID;
    SELECT WalletBalance INTO v_balance FROM Users
    WHERE  UserID = v_auction.WinningUserID FOR UPDATE;

    IF v_balance >= v_auction.CurrentHighestBid THEN
      apply_wallet_txn(v_auction.WinningUserID, v_auction.CurrentHighestBid, 'Debit');
      apply_wallet_txn(v_seller,                v_auction.CurrentHighestBid, 'Credit');
      p_result := 'SOLD: Winner is user ' || v_auction.WinningUserID ||
                  ' at ' || v_auction.CurrentHighestBid;
    ELSE
      UPDATE Wallet
      SET    TransactionType = 'Debit', TransactionDate = SYSDATE, Status = 'Failed'
      WHERE  UserID = v_auction.WinningUserID;
      p_result := 'ENDED: Winner has insufficient balance, payment failed';
    END IF;

    UPDATE Auctions SET Status = 'Ended' WHERE AuctionID = p_auction_id;
  END IF;
  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    p_result := 'FAILED: Auction not found';
END;
/

-- Close every auction whose time is over (the website calls this before every request)
CREATE OR REPLACE PROCEDURE close_expired_auctions AS
  v_msg VARCHAR2(200);
BEGIN
  FOR a IN (SELECT AuctionID FROM Auctions WHERE Status = 'Live' AND EndTime < SYSDATE) LOOP
    close_auction(a.AuctionID, v_msg);
  END LOOP;
END;
/

-- ============================================================
-- BIDS : insert (place_bid), update (raise own bid), delete (rejected only)
-- ============================================================
-- INSERT a bid. EVERY attempt is stored in Bids as Accepted or Rejected.
-- Rules, in order: auction open, not your own item, not already the highest
-- bidder, at least the minimum bid, within your available balance.
CREATE OR REPLACE PROCEDURE place_bid (
  p_auction_id IN  NUMBER,
  p_user_id    IN  NUMBER,
  p_amount     IN  NUMBER,
  p_result     OUT VARCHAR2
) AS
  v_auction   Auctions%ROWTYPE;
  v_seller    NUMBER;
  v_balance   NUMBER;
  v_available NUMBER;
  v_min_bid   NUMBER;
  v_reason    VARCHAR2(200) := NULL;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    p_result := 'FAILED: Bid amount must be greater than 0';
    RETURN;
  END IF;

  -- Lock the auction row so two simultaneous bids cannot clash
  SELECT * INTO v_auction FROM Auctions WHERE AuctionID = p_auction_id FOR UPDATE;
  SELECT SellerID      INTO v_seller  FROM Items WHERE ItemID = v_auction.ItemID;
  SELECT WalletBalance INTO v_balance FROM Users WHERE UserID = p_user_id;

  v_available := v_balance - get_held_amount(p_user_id, p_auction_id);

  IF v_auction.WinningUserID IS NULL THEN
    v_min_bid := v_auction.StartingPrice;
  ELSE
    v_min_bid := v_auction.CurrentHighestBid + min_increment(v_auction.CurrentHighestBid);
  END IF;

  IF v_auction.Status = 'Cancelled' THEN
    v_reason := 'The seller cancelled this auction';
  ELSIF v_auction.Status <> 'Live' OR SYSDATE > v_auction.EndTime THEN
    v_reason := 'This auction has ended';
  ELSIF SYSDATE < v_auction.StartTime THEN
    v_reason := 'This auction has not started yet';
  ELSIF v_seller = p_user_id THEN
    v_reason := 'You cannot bid on your own item';
  ELSIF v_auction.WinningUserID = p_user_id THEN
    v_reason := 'You already have the highest bid';
  ELSIF p_amount < v_min_bid THEN
    v_reason := 'Your bid must be at least Rs ' || TO_CHAR(CEIL(v_min_bid), 'FM9999999990');
  ELSIF p_amount > v_available THEN
    v_reason := 'Your available balance is Rs ' || TO_CHAR(FLOOR(v_available), 'FM9999999990')
                || '. Add money to your wallet to place this bid.';
  END IF;

  IF v_reason IS NULL THEN
    UPDATE Auctions
    SET    CurrentHighestBid = p_amount, WinningUserID = p_user_id
    WHERE  AuctionID = p_auction_id;

    INSERT INTO Bids (BidID, AuctionID, ItemID, UserID, WinningUserID, BidAmount, Status)
    VALUES (bids_seq.NEXTVAL, p_auction_id, v_auction.ItemID, p_user_id, p_user_id, p_amount, 'Accepted');

    p_result := 'SUCCESS: Bid placed';
  ELSE
    INSERT INTO Bids (BidID, AuctionID, ItemID, UserID, WinningUserID, BidAmount, Status)
    VALUES (bids_seq.NEXTVAL, p_auction_id, v_auction.ItemID, p_user_id, v_auction.WinningUserID, p_amount, 'Rejected');

    p_result := 'FAILED: ' || v_reason;
  END IF;

  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    p_result := 'FAILED: Auction or user not found';
END;
/

-- UPDATE a bid: raise your own LEADING bid on a live auction
CREATE OR REPLACE PROCEDURE update_bid (
  p_bid_id     IN  NUMBER,
  p_new_amount IN  NUMBER,
  p_result     OUT VARCHAR2
) AS
  v_bid       Bids%ROWTYPE;
  v_auction   Auctions%ROWTYPE;
  v_available NUMBER;
  v_min_bid   NUMBER;
BEGIN
  SELECT * INTO v_bid FROM Bids WHERE BidID = p_bid_id;
  SELECT * INTO v_auction FROM Auctions WHERE AuctionID = v_bid.AuctionID FOR UPDATE;

  v_min_bid   := v_auction.CurrentHighestBid + min_increment(v_auction.CurrentHighestBid);
  v_available := get_available_balance(v_bid.UserID, v_auction.AuctionID);

  IF v_bid.Status <> 'Accepted' THEN
    p_result := 'FAILED: Only an accepted bid can be changed.';
  ELSIF v_auction.Status <> 'Live' OR SYSDATE > v_auction.EndTime THEN
    p_result := 'FAILED: The auction is closed, so the bid cannot change.';
  ELSIF v_auction.WinningUserID <> v_bid.UserID OR v_auction.CurrentHighestBid <> v_bid.BidAmount THEN
    p_result := 'FAILED: Only the current highest bid can be raised.';
  ELSIF p_new_amount IS NULL OR p_new_amount < v_min_bid THEN
    p_result := 'FAILED: A raised bid must be at least Rs ' || TO_CHAR(CEIL(v_min_bid), 'FM9999999990');
  ELSIF p_new_amount > v_available THEN
    p_result := 'FAILED: Your available balance is Rs ' || TO_CHAR(FLOOR(v_available), 'FM9999999990');
  ELSE
    UPDATE Bids     SET BidAmount = p_new_amount, BidTime = CURRENT_TIMESTAMP WHERE BidID = p_bid_id;
    UPDATE Auctions SET CurrentHighestBid = p_new_amount WHERE AuctionID = v_auction.AuctionID;
    p_result := 'SUCCESS: Bid updated';
  END IF;
  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    ROLLBACK;
    p_result := 'FAILED: Bid not found';
END;
/

-- DELETE a bid: only Rejected attempts. Accepted bids are the auction's history.
CREATE OR REPLACE PROCEDURE delete_bid (
  p_bid_id IN  NUMBER,
  p_result OUT VARCHAR2
) AS
  v_status VARCHAR2(20);
BEGIN
  SELECT Status INTO v_status FROM Bids WHERE BidID = p_bid_id;
  IF v_status = 'Accepted' THEN
    p_result := 'FAILED: An accepted bid is part of the auction history and cannot be deleted.';
  ELSE
    DELETE FROM Bids WHERE BidID = p_bid_id;
    COMMIT;
    p_result := 'SUCCESS: Bid deleted';
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    p_result := 'FAILED: Bid not found';
END;
/

PROMPT Procedures, functions and view created.
