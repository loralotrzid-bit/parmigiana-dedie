/**
 * AuthRedirectHandler — NO-OP.
 * All redirect logic now uses URL query params (?redirect=).
 * This component is kept as a no-op to avoid breaking imports.
 */
const AuthRedirectHandler = () => null;

export default AuthRedirectHandler;
