import { closePool } from "../database.js";
import {
  findUserByUsername,
  listUsers,
  updateRole,
  upsertUserByUsername,
} from "../repositories/userRepository.js";

const testUser = {
  username: "test_admin",
  password_hash: "dummy_hash_for_test",
  role: "admin",
  status: "active",
};

try {
  const savedUser = await upsertUserByUsername(testUser);
  console.log("[UserRepository] Upserted user:", savedUser);

  const userWithPasswordHash = await findUserByUsername(testUser.username);
  console.log("[UserRepository] Found by username:", {
    ...userWithPasswordHash,
    password_hash: userWithPasswordHash?.password_hash ? "[present]" : null,
  });

  const updatedUser = await updateRole(savedUser.id, "viewer");
  console.log("[UserRepository] Updated role:", updatedUser);

  const users = await listUsers({ limit: 10 });
  console.log("[UserRepository] Users:");
  console.table(users);
} catch (error) {
  console.error("[UserRepository] Test failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
