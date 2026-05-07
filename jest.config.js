module.exports = {
    preset: 'jest-expo',

    testPathIgnorePatterns: [
        '/node_modules/',
    ],

    transformIgnorePatterns: [
        'node_modules/(?!(react-native|@react-native|expo|@expo|expo-modules-core|@react-navigation)/)',
    ],
};