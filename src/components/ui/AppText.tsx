import React from 'react';
import {StyleSheet, Text, TextProps, TextStyle,} from 'react-native';

import {colors, typography,} from '../../theme';

type AppTextVariant =
    | 'title'
    | 'subtitle'
    | 'sectionTitle'
    | 'body'
    | 'bodyStrong'
    | 'caption'
    | 'button';

type Props = TextProps & {
    variant?: AppTextVariant;
    color?: keyof typeof colors;
    align?: TextStyle['textAlign'];
};

export function AppText({
                            variant = 'body',
                            color = 'text',
                            align,
                            style,
                            children,
                            ...props
                        }: Props) {
    return (
        <Text
            {...props}
            style={[
                styles.base,
                typography[variant],
                {
                    color: colors[color],
                    textAlign: align,
                },
                style,
            ]}
        >
            {children}
        </Text>
    );
}

const styles = StyleSheet.create({
    base: {
        includeFontPadding: false,
    },
});