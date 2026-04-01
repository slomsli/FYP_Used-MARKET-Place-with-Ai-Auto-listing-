require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testAdminCreate() {
  console.log("Calling auth.admin.createUser...");
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: "slom3010bajaba2@gmail.com",
      password: "password123!",
      email_confirm: true,
      user_metadata: {
        full_name: "Sulaiman Mohammed",
        username: "slomsli2",
      },
    });

    console.log("Admin create error:", error);
    console.log("Admin create data:", data);

    if (data.user) {
      console.log("Cleaning up...");
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    }
  } catch (err) {
    console.error("Crash:", err);
  }
}

testAdminCreate();
