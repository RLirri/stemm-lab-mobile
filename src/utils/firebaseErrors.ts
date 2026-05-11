export function friendlyAuthError(code?: string) {
    switch (code) {
        case "auth/invalid-email":
            return "That email address is not valid.";
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
            return "Email or password is incorrect.";
        case "auth/email-already-in-use":
            return "That email is already registered.";
        case "auth/weak-password":
            return "Password is too weak (use at least 6 characters).";
        case "auth/network-request-failed":
            return "Network error. Please check your connection.";
        default:
            return "Something went wrong. Please try again.";
    }
}
