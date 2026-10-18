# BidForge: live jewellery auctions (DBMS project)

```
frontend/   HTML + CSS + JS website (15 pages, including the Records manager)
backend/    app.py  (Flask + python-oracledb): serves the website and calls Oracle
database/   01 schema, 02 procedures, 03 sample data, 04 reports + tests, run_all.sql
```

The database has **exactly the five tables of your design**: Users, Items, Auctions, Bids, Wallet,
with exactly the columns, data types and constraints from your table sheets (plus `Users.Password`,
as you wrote on the sheet). There are no other tables and no other columns.

## Run it

1. **Database.** In `database/`:
   ```
   sqlplus system/YOUR_PASSWORD@localhost:1521/XEPDB1
   SQL> @run_all.sql
   ```
   (Use `/XE` instead of `/XEPDB1` on older installs.) This drops and rebuilds everything, so it is
   also the reset button. At the end "Compile errors" must say *no rows selected*; if not, run `SHOW ERRORS`.
2. **Backend.** In `backend/`:
   ```
   pip install -r requirements.txt
   set DB_PASSWORD=YOUR_PASSWORD          (Windows)   |   export DB_PASSWORD=YOUR_PASSWORD   (Mac/Linux)
   python app.py
   ```
   Set `DB_DSN` too if your connection string is not `localhost:1521/XEPDB1`.
3. Open **http://localhost:5000**.

The database script inserts starter records so the browse, auction, bidding and reporting flows can be inspected immediately. These are development records, not real users or listings. Change or remove them before deployment.

## How the ER diagram maps to the tables

| ER relationship | Where it lives |
|---|---|
| User 1 : 1 **HAS WALLET** Wallet | `Wallet.UserID` is `UNIQUE`; trigger `trg_user_wallet` creates the row |
| User 1 : N **SELLS** Item | `Items.SellerID` -> Users |
| User 1 : N **PLACES** Bid | `Bids.UserID` -> Users |
| User 1 : N **REFERS WINNER** Bid | `Bids.WinningUserID` -> Users (leader after that bid) |
| User 1 : N **WINS** Auction | `Auctions.WinningUserID` -> Users |
| Item 1 : 1 **FOR ITEM** Auction | `Auctions.ItemID` is `UNIQUE`; `create_auction` refuses a second auction |
| Item 1 : N **BID FOR ITEM** Bid | `Bids.ItemID` -> Items |
| Auction 1 : N **PLACED ON** Bid | `Bids.AuctionID` -> Auctions |

## Operations on every table (all on the **Records** page, and tested in `04_reports_and_tests.sql`)

| Table | Create | Retrieve / Search | Update | Delete |
|---|---|---|---|---|
| Users | `register_user` | list + search name, email, phone, address, ID | `update_user` | `delete_user` (trigger blocks users with items or bids) |
| Items | `add_item` | list + search name, category, seller, ID | `update_item` (price only while no auction) | `delete_item` (only if no auction) |
| Auctions | `create_auction` (one per item) | list + search item, seller, winner, status, ID | `update_auction`, `cancel_auction` (live, no bids) | `delete_auction` (not with accepted bids) |
| Bids | `place_bid` (stored Accepted or Rejected) | list + search item, bidder, status, ID | `update_bid` (raise your leading bid) | `delete_bid` (Rejected only) |
| Wallet | `create_wallet`, trigger | list + search owner, type, status, ID | `add_money`, `withdraw_money` | `delete_wallet` (balance must be 0) |

The normal pages (browse with search and filters, sell, bid, wallet, dashboard) use the same procedures.

## What was removed so it matches your design

`Items.Metal`, `Items.Purity`, `Items.ImageURL` and their CHECK constraints; the extra `BidLog` table
and its trigger; the MongoDB logging; the old split SQL files (03 to 09 patched each other, now one
clean set); the Metal filter, photo link and metal/purity fields on the website. Item pictures are now
drawings chosen by `Category`.

## Where each DBMS topic is shown

| Topic | Where |
|---|---|
| Tables, keys, CHECK / UNIQUE / FK, indexes, sequences | `01_schema.sql` |
| Triggers | `trg_user_wallet`, `trg_protect_user_delete` (01) |
| Procedures | all of `02_procedures.sql` |
| Functions | `get_highest_bid`, `get_total_spent`, `min_increment`, `get_held_amount`, `get_available_balance`, `hash_pw` |
| Cursor | `seller_sales_report` (04) |
| Views | `v_active_auctions`, `v_bid_history` (01), `v_auction_detail` (02, used by the site) |
| JOIN, GROUP BY, HAVING, subquery | `04_reports_and_tests.sql` |
| Transactions and locking | `FOR UPDATE` on the auction row in `place_bid`; `COMMIT` / `ROLLBACK` in each procedure |
| Application connectivity | `backend/app.py` (python-oracledb, the Python counterpart of JDBC) |

## Be ready to be asked

- **3NF.** Your sheets keep a few repeated values: `WalletBalance` in both Users and Wallet,
  `Bids.ItemID` and `Bids.WinningUserID` (derivable), `StartingPrice` in both Items and Auctions.
  They are kept in sync by the procedures. Defend this as controlled denormalisation (the Wallet
  row also records the last transaction), or discuss removing them.
- **Wallet holds one row per user** (the latest transaction), because `UserID` is `UNIQUE`.
- **One auction per item** follows the 1:1 in your ER diagram, so a cancelled item cannot be
  re-auctioned. Delete the cancelled auction on the Records page to free the item.

## Known limits

- **Oracle execution has not been verified in this environment.** Python and JavaScript syntax can be checked locally, but the SQL and full application flow must be tested against your Oracle instance before use. Run `run_all.sql` first; if anything errors, `SHOW ERRORS` and send it back.
- No real login session: the browser sends its `user_id` and the server trusts it (not suitable for deployment).
  The Records page is open to any logged-in user, and must be restricted to authorized administrators.
- Auctions close when the next request arrives (`close_expired_auctions` runs before every API call).
- `api.js` uses synchronous XMLHttpRequest so the page scripts did not need rewriting; Chrome shows a warning.
