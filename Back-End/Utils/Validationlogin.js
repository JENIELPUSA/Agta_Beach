// validation.js
export default function Validation(values, formType) {
    const errors = {};

    // Patterns for validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,6}$/;


    // Validate email
    if (!values.email) {
        errors.email = "Email is required!";
    } else if (!emailPattern.test(values.email)) {
        errors.email = "Email format is invalid!";
    }

    if (!values.password) {
        errors.password = "Password is required!";
    }
    return errors;
}
