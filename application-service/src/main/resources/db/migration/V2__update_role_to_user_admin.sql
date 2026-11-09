-- V2__update_role_to_user_admin.sql
-- Migrate roles to the 2-role system: USER and ADMIN

ALTER TABLE applicants ALTER COLUMN role SET DEFAULT 'USER';

UPDATE applicants SET role = 'USER' WHERE role = 'APPLICANT';
UPDATE applicants SET role = 'ADMIN' WHERE role = 'UNDERWRITER';

