// Imported first so these are set before src/config.js is evaluated.
process.env.NODE_ENV = 'test';
process.env.MODERATION_MODE ||= 'off';
process.env.DATABASE_URL ||= 'postgres://marriage:marriage@localhost:5432/marriageswipe_test';
process.env.UPLOAD_DIR ||= '/tmp/ms-test-uploads';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123';
