import { Navigate } from "react-router-dom"

// Reads the token during render rather than in an effect, so an
// unauthenticated visitor never sees a frame of the protected page
const readToken = () => {
    try {
        return localStorage.getItem("token");
    } catch (e) {
        // Safari private mode throws on localStorage access
        return null;
    }
}

const withAuth = (WrappedComponent) => {
    const AuthComponent = (props) => {
        if (!readToken()) {
            // replace: keeps Back from bouncing between /auth and the guard
            return <Navigate to="/auth" replace />
        }

        return <WrappedComponent {...props} />
    }

    return AuthComponent;
}

export default withAuth;
