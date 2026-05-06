import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {
    ActivityHistoryItem,
    getUserActivityHistory,
} from '../../services/activityHistoryService';
import {activityCatalog} from '../../features/activities/activityCatalog';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSearchBar,
    AppSectionHeader,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
    AppExpandableCard,
} from '../../components/ui';

import {colors, spacing} from '../../theme';
import {AppAdBanner} from '../../components/ads';

type Props = NativeStackScreenProps<AppStackParamList, 'ActivityHistory'>;

function getActivityTitle(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.title ?? 'Unknown activity';
}

function getActivityCategory(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.category ?? 'General';
}

function getActivityDifficulty(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.difficulty ?? 'Standard';
}

function formatStatus(status?: string): string {
    if (!status) {
        return 'Submitted';
    }

    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getUniqueValues(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function matchesFilter(value: string, selectedValue: string): boolean {
    return selectedValue === 'All' || value === selectedValue;
}

export default function ActivityHistoryScreen({navigation}: Props) {
    const [history, setHistory] = useState<ActivityHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedDifficulty, setSelectedDifficulty] = useState('All');
    const [selectedStatus, setSelectedStatus] = useState('All');

    const completedCount = history.length;
    const latestSubmission = useMemo(() => history[0], [history]);

    const categoryOptions = useMemo(
        () => ['All', ...getUniqueValues(history.map((item) => getActivityCategory(item.activityId)))],
        [history],
    );

    const difficultyOptions = useMemo(
        () => ['All', ...getUniqueValues(history.map((item) => getActivityDifficulty(item.activityId)))],
        [history],
    );

    const statusOptions = useMemo(
        () => ['All', ...getUniqueValues(history.map((item) => formatStatus(item.status)))],
        [history],
    );

    const hasActiveFilters =
        searchQuery.trim().length > 0 ||
        selectedCategory !== 'All' ||
        selectedDifficulty !== 'All' ||
        selectedStatus !== 'All';

    const filteredHistory = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        return history.filter((item) => {
            const title = getActivityTitle(item.activityId);
            const category = getActivityCategory(item.activityId);
            const difficulty = getActivityDifficulty(item.activityId);
            const status = formatStatus(item.status);
            const team = item.teamId ?? 'Individual';

            const searchableText = [
                title,
                category,
                difficulty,
                status,
                team,
                item.activityId,
                item.id,
            ]
                .join(' ')
                .toLowerCase();

            const matchesSearch =
                normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);

            return (
                matchesSearch &&
                matchesFilter(category, selectedCategory) &&
                matchesFilter(difficulty, selectedDifficulty) &&
                matchesFilter(status, selectedStatus)
            );
        });
    }, [history, searchQuery, selectedCategory, selectedDifficulty, selectedStatus]);

    const clearFilters = () => {
        setSearchQuery('');
        setSelectedCategory('All');
        setSelectedDifficulty('All');
        setSelectedStatus('All');
    };

    const loadHistory = useCallback(async (refresh = false) => {
        try {
            if (refresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setErrorMessage(null);

            const result = await getUserActivityHistory();
            setHistory(result);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Unable to load activity history.',
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading activity history..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Learning record
            </AppText>

            <AppText variant="title" style={styles.title}>
                Activity History
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Review your completed STEMM Lab activities and previous experiment submissions.
            </AppText>

            {errorMessage ? (
                <InfoBanner
                    title="History unavailable"
                    message={errorMessage}
                    tone="warning"
                />
            ) : null}

            {completedCount > 0 ? (
                <AppCard style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <View>
                            <AppText variant="caption" color="textMuted">
                                Completed submissions
                            </AppText>

                            <AppText variant="title" style={styles.summaryNumber}>
                                {completedCount}
                            </AppText>
                        </View>

                        <AppBadge label="Learning progress" tone="success"/>
                    </View>

                    {latestSubmission ? (
                        <AppText variant="body" color="textMuted" style={styles.latestText}>
                            Latest: {getActivityTitle(latestSubmission.activityId)}
                        </AppText>
                    ) : null}
                </AppCard>
            ) : null}

            {history.length > 0 ? (
                <AppExpandableCard
                    title={hasActiveFilters ? 'Search and Filter Active' : 'Search and Filter'}
                    defaultExpanded={false}
                >
                    <AppSearchBar
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search by activity, team, status, or ID..."
                        style={styles.searchBar}
                    />

                    <FilterGroup
                        title="Category"
                        options={categoryOptions}
                        selectedValue={selectedCategory}
                        onSelect={setSelectedCategory}
                    />

                    <FilterGroup
                        title="Difficulty"
                        options={difficultyOptions}
                        selectedValue={selectedDifficulty}
                        onSelect={setSelectedDifficulty}
                    />

                    <FilterGroup
                        title="Status"
                        options={statusOptions}
                        selectedValue={selectedStatus}
                        onSelect={setSelectedStatus}
                    />

                    <View style={styles.filterFooter}>
                        <AppText variant="caption" color="textMuted">
                            Showing {filteredHistory.length} of {history.length} submissions
                        </AppText>

                        {hasActiveFilters ? (
                            <AppButton
                                title="Clear"
                                variant="secondary"
                                onPress={clearFilters}
                            />
                        ) : null}
                    </View>
                </AppExpandableCard>
            ) : null}

            <AppSectionHeader
                title="Submitted activities"
                subtitle="Tap a submission card to view its details."
            />

            {history.length === 0 ? (
                <EmptyState
                    title="No activity history yet"
                    message="Complete your first STEMM activity to see your submitted work here."
                />
            ) : filteredHistory.length === 0 ? (
                <EmptyState
                    title="No matching submissions"
                    message="Try adjusting the search keyword or clearing the selected filters."
                />
            ) : (
                <View style={styles.list}>
                    {filteredHistory.map((item) => (
                        <Pressable
                            key={item.id}
                            onPress={() =>
                                navigation.navigate('ActivityHistoryDetail', {
                                    historyItem: item,
                                })
                            }
                            style={({pressed}) => [
                                styles.pressableCard,
                                pressed && styles.pressedCard,
                            ]}
                        >
                            <AppCard style={styles.historyCard}>
                                <View style={styles.historyHeader}>
                                    <View style={styles.historyTextArea}>
                                        <AppText variant="subtitle">
                                            {getActivityTitle(item.activityId)}
                                        </AppText>

                                        <View style={styles.badgeRow}>
                                            <AppBadge
                                                label={getActivityCategory(item.activityId)}
                                                tone="info"
                                            />
                                            <AppBadge
                                                label={getActivityDifficulty(item.activityId)}
                                                tone="warning"
                                            />
                                        </View>
                                    </View>

                                    <AppBadge label={formatStatus(item.status)} tone="success"/>
                                </View>

                                <View style={styles.metaRow}>
                                    <View style={styles.metaItem}>
                                        <AppText variant="caption" color="textMuted">
                                            Score
                                        </AppText>

                                        <AppText variant="bodyStrong" style={styles.metaValue}>
                                            {Number.isFinite(item.score) ? item.score : '-'}
                                        </AppText>
                                    </View>

                                    <View style={styles.metaItem}>
                                        <AppText variant="caption" color="textMuted">
                                            Team
                                        </AppText>

                                        <AppText variant="bodyStrong" style={styles.metaValue}>
                                            {item.teamId ?? 'Individual'}
                                        </AppText>
                                    </View>
                                </View>

                                <AppText variant="caption" color="textMuted" style={styles.tapHint}>
                                    Tap to view submission details
                                </AppText>
                            </AppCard>
                        </Pressable>
                    ))}
                </View>
            )}

            <AppAdBanner placement="history"/>

            {refreshing ? (
                <AppText variant="caption" color="textMuted" style={styles.refreshingText}>
                    Refreshing history...
                </AppText>
            ) : null}
        </AppGradientScreen>
    );
}

type FilterGroupProps = {
    title: string;
    options: string[];
    selectedValue: string;
    onSelect: (value: string) => void;
};

function FilterGroup({title, options, selectedValue, onSelect}: FilterGroupProps) {
    return (
        <View style={styles.filterGroup}>
            <AppText variant="caption" color="textMuted">
                {title}
            </AppText>

            <View style={styles.filterOptions}>
                {options.map((option) => {
                    const selected = option === selectedValue;

                    return (
                        <Pressable
                            key={`${title}-${option}`}
                            onPress={() => onSelect(option)}
                            style={[
                                styles.filterChip,
                                selected && styles.filterChipSelected,
                            ]}
                        >
                            <AppText
                                variant="caption"
                                color={selected ? 'surface' : 'textMuted'}
                            >
                                {option}
                            </AppText>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },

    summaryCard: {
        marginBottom: spacing.md,
    },

    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    summaryNumber: {
        marginTop: spacing.xs,
        color: colors.primary,
    },

    latestText: {
        marginTop: spacing.md,
    },

    filterCard: {
        gap: spacing.md,
        marginBottom: spacing.md,
    },

    searchBar: {
        marginTop: spacing.sm,
    },

    filterGroup: {
        gap: spacing.sm,
    },

    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    filterChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },

    filterChipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    filterFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
        marginTop: spacing.xs,
    },

    list: {
        gap: spacing.md,
    },

    pressableCard: {
        borderRadius: 20,
    },

    pressedCard: {
        opacity: 0.86,
        transform: [{scale: 0.99}],
    },

    historyCard: {
        gap: spacing.md,
    },

    historyHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    historyTextArea: {
        flex: 1,
    },

    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },

    metaRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    metaItem: {
        flex: 1,
    },

    metaValue: {
        marginTop: spacing.xs,
    },

    tapHint: {
        marginTop: spacing.xs,
    },

    refreshingText: {
        marginTop: spacing.md,
        textAlign: 'center',
    },
});