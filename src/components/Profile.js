import React from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

function Profile() {
  return (
    <div>
      <h2>Welcome to DateScape!</h2>
      <p>You're logged in as {auth.currentUser?.email}</p>
      <button onClick={() => signOut(auth)}>Log Out</button>
    </div>
  );
}

export default Profile;