exports.log = (...args) => {
    console.log(new Date().toISOString(), ...args);
};