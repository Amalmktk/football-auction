-- Default bidding: captains bid from phones AND the admin can enter bids for
-- teams whose captains raise hands ('captain' mode). 'auctioneer' = admin only.

alter table settings alter column mode set default 'captain';
update settings set mode = 'captain' where id = 1;
