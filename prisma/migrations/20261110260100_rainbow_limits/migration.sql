-- Rainbow: one of one. A single Rainbow card per player, ever (any tier).
ALTER TABLE "CardFinish" DROP CONSTRAINT "CardFinish_serial_range";
ALTER TABLE "CardFinish" ADD CONSTRAINT "CardFinish_serial_range" CHECK (
  ("kind" = 'RUBY' AND "serial" BETWEEN 1 AND 10)
  OR ("kind" = 'DIAMOND' AND "serial" BETWEEN 1 AND 5)
  OR ("kind" = 'RAINBOW' AND "serial" = 1)
);
