// src/types/visualization.ts

export type ChartPoint = {
    label: string;
    value: number;
    frontColor?: string;
};

export type ResultInsight = {
    title: string;
    message: string;
    severity: 'positive' | 'neutral' | 'warning';
};