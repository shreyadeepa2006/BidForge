-- ============================================================
-- BidForge : 01_schema.sql
-- The FIVE tables of the ER diagram, exactly as designed:
--   Users, Items, Auctions, Bids, Wallet
-- plus sequences, indexes, two triggers and three views.
-- Safe to re-run: it drops the old objects first.
-- ============================================================
SET DEFINE OFF

-- ---------- Clean up (so the script can be re-run) ----------
BEGIN
  FOR t IN (SELECT table_name FROM user_tables
            WHERE table_name IN ('BIDLOG','BIDS','AUCTIONS','WALLET','ITEMS','USERS')) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS';
  END LOOP;

  FOR s IN (SELECT sequence_name FROM user_sequences
            WHERE sequence_name IN ('USERS_SEQ','ITEMS_SEQ','AUCTIONS_SEQ','BIDS_SEQ','WALLET_SEQ','BIDLOG_SEQ')) LOOP
    EXECUTE IMMEDIATE 'DROP SEQUENCE ' || s.sequence_name;
  END LOOP;
END;
/

-- ---------- Table 1 : USERS ----------
CREATE TABLE Users (
  UserID         NUMBER         PRIMARY KEY,
  FullName       VARCHAR2(100)  NOT NULL,
  Email          VARCHAR2(100)  NOT NULL UNIQUE,
  Password       VARCHAR2(100)  NOT NULL,
  PhoneNo        VARCHAR2(15)   UNIQUE,
  WalletBalance  NUMBER(10,2)   DEFAULT 0 NOT NULL CHECK (WalletBalance >= 0),
  DateJoined     DATE           DEFAULT SYSDATE,
  Address        VARCHAR2(200)
);

-- ---------- Table 2 : ITEMS   (User 1 --SELLS--> N Item) ----------
CREATE TABLE Items (
  ItemID         NUMBER         PRIMARY KEY,
  SellerID       NUMBER         NOT NULL REFERENCES Users(UserID),
  ItemName       VARCHAR2(100)  NOT NULL,
  Description    VARCHAR2(300),
  Category       VARCHAR2(50)   NOT NULL,
  Condition      VARCHAR2(20)   CHECK (Condition IN ('New','Like New','Good','Fair')),
  StartingPrice  NUMBER(10,2)   CHECK (StartingPrice > 0),
  CreatedAt      DATE           DEFAULT SYSDATE
);

-- ---------- Table 3 : AUCTIONS ----------
--   Item 1 --FOR ITEM--> 1 Auction   (so ItemID is UNIQUE)
--   User 1 --WINS-->     N Auction   (WinningUserID)
CREATE TABLE Auctions (
  AuctionID          NUMBER        PRIMARY KEY,
  ItemID             NUMBER        NOT NULL UNIQUE REFERENCES Items(ItemID),
  WinningUserID      NUMBER        REFERENCES Users(UserID),   -- NULL until the first bid
  StartingPrice      NUMBER(10,2)  CHECK (StartingPrice > 0),
  CurrentHighestBid  NUMBER(10,2),
  StartTime          DATE          NOT NULL,
  EndTime            DATE          NOT NULL,
  Status             VARCHAR2(20)  DEFAULT 'Live' CHECK (Status IN ('Live','Ended','Cancelled')),
  CONSTRAINT chk_auc_highest CHECK (CurrentHighestBid >= StartingPrice)
);

-- ---------- Table 4 : BIDS ----------
--   User 1 --PLACES-->        N Bid   (UserID)
--   User 1 --REFERS WINNER--> N Bid   (WinningUserID)
--   Item 1 --BID FOR ITEM-->  N Bid   (ItemID)
--   Auction 1 --PLACED ON-->  N Bid   (AuctionID)
CREATE TABLE Bids (
  BidID          NUMBER        PRIMARY KEY,
  AuctionID      NUMBER        NOT NULL REFERENCES Auctions(AuctionID),
  ItemID         NUMBER        NOT NULL REFERENCES Items(ItemID),
  UserID         NUMBER        NOT NULL REFERENCES Users(UserID),
  WinningUserID  NUMBER        REFERENCES Users(UserID),
  BidAmount      NUMBER(10,2)  NOT NULL CHECK (BidAmount > 0),
  BidTime        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  Status         VARCHAR2(20)  CHECK (Status IN ('Accepted','Rejected'))
);

-- ---------- Table 5 : WALLET   (User 1 --HAS WALLET--> 1 Wallet) ----------
CREATE TABLE Wallet (
  TransactionID    NUMBER        PRIMARY KEY,
  UserID           NUMBER        NOT NULL UNIQUE REFERENCES Users(UserID),
  WalletBalance    NUMBER(10,2)  DEFAULT 0 CHECK (WalletBalance >= 0),
  TransactionType  VARCHAR2(20)  CHECK (TransactionType IN ('Credit','Debit')),
  TransactionDate  DATE          DEFAULT SYSDATE,
  Status           VARCHAR2(20)  CHECK (Status IN ('Success','Failed'))
);

-- ---------- Indexes on foreign keys (faster joins) ----------
-- (Auctions.ItemID and Wallet.UserID are already indexed by their UNIQUE constraints.)
CREATE INDEX idx_items_seller   ON Items(SellerID);
CREATE INDEX idx_auc_winner     ON Auctions(WinningUserID);
CREATE INDEX idx_bids_auction   ON Bids(AuctionID);
CREATE INDEX idx_bids_item      ON Bids(ItemID);
CREATE INDEX idx_bids_user      ON Bids(UserID);

-- ---------- Sequences (they generate the IDs) ----------
CREATE SEQUENCE users_seq    START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE items_seq    START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE auctions_seq START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE bids_seq     START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE wallet_seq   START WITH 1 INCREMENT BY 1 NOCACHE;

-- ---------- Trigger 1: every new user automatically gets a wallet row (1:1) ----------
CREATE OR REPLACE TRIGGER trg_user_wallet
AFTER INSERT ON Users
FOR EACH ROW
BEGIN
  INSERT INTO Wallet (TransactionID, UserID, WalletBalance)
  VALUES (wallet_seq.NEXTVAL, :NEW.UserID, :NEW.WalletBalance);
END;
/

-- ---------- Trigger 2: a user who has items or bids cannot be deleted ----------
-- A clean user (no items, no bids) can be deleted; their wallet row goes with them.
CREATE OR REPLACE TRIGGER trg_protect_user_delete
BEFORE DELETE ON Users
FOR EACH ROW
DECLARE
  v_items NUMBER;
  v_bids  NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_items FROM Items WHERE SellerID = :OLD.UserID;
  SELECT COUNT(*) INTO v_bids  FROM Bids  WHERE UserID   = :OLD.UserID;

  IF v_items > 0 OR v_bids > 0 THEN
    RAISE_APPLICATION_ERROR(-20010, 'Cannot delete user: they have items or bids');
  END IF;

  DELETE FROM Wallet WHERE UserID = :OLD.UserID;
END;
/

-- ---------- Views ----------
CREATE OR REPLACE VIEW v_active_auctions AS
SELECT a.AuctionID, i.ItemID, i.ItemName, i.Category, i.Condition, i.Description,
       u.FullName AS SellerName, a.StartingPrice, a.CurrentHighestBid, a.WinningUserID, a.EndTime
FROM   Auctions a
JOIN   Items i ON a.ItemID   = i.ItemID
JOIN   Users u ON i.SellerID = u.UserID
WHERE  a.Status = 'Live'
AND    SYSDATE BETWEEN a.StartTime AND a.EndTime;

CREATE OR REPLACE VIEW v_bid_history AS
SELECT b.BidID, b.AuctionID, i.ItemName, u.FullName AS BidderName,
       b.BidAmount, b.BidTime, b.Status
FROM   Bids b
JOIN   Items i ON b.ItemID = i.ItemID
JOIN   Users u ON b.UserID = u.UserID;

-- One row per auction with its item, seller, winner and number of accepted bids.
-- Phase: upcoming | live | ended | cancelled   (the Flask API reads this view)
-- The "minimum next bid" is worked out by the function min_increment (02_procedures.sql),
-- so the view is created at the end of that file.

PROMPT Schema created (5 tables).
