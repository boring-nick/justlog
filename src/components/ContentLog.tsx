import { InputAdornment, TextField } from "@mui/material";
import { Search } from "@mui/icons-material";
import React, { useContext, useState, CSSProperties, useRef, useEffect } from "react";
import styled from "styled-components";
import { store } from "../store";
import { LogLine } from "./LogLine";
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from "react-window-infinite-loader";
import { Emote, LogMessage, UserLogResponse } from "../types/log";
import { getUserId, isUserId } from "../services/isUserId";
import runes from "runes";

const ContentLogContainer = styled.ul`
    padding: 0;
    margin: 0;
    position: relative;

    .search {
        position: absolute;
        top: -52px;
        width: 320px;
        left: 0;
    }

    .logLine {
        white-space: nowrap;
    }

    .list {
        scrollbar-color: dark;
    }
`;

export function ContentLog({
    year,
    month,
}: {
    year: string,
    month: string,
}) {
    const { state, setState } = useContext(store);
    const [searchText, setSearchText] = useState("");

    const [logs, setLogs]: [Array<LogMessage>, any] = useState([]);
    const [isNextPageLoading, setIsNextPageLoading] = useState(false);
    const [hasNextPage, setHasNextPage] = useState(true);

    const CHUNK_SIZE = 1000;

    const loadNextPage = async (startIndex: number, stopIndex: number) => {
        const offset = startIndex;
        const newLogs = await fetchLog(state.apiBaseUrl, state.currentChannel ?? "", state.currentUsername ?? "", year, month, CHUNK_SIZE, offset);

        if (newLogs.length < CHUNK_SIZE) {
            setHasNextPage(false);
        }

        setLogs(logs.concat(newLogs));
    };

    const filteredLogs = logs.filter(log => log.text.toLowerCase().includes(searchText.toLowerCase()));
    const Row = ({ index, style }: { index: number, style: CSSProperties }) => {
        let content;
        if (!isItemLoaded(index)) {
            content = "Loading...";
        } else {
            content = <LogLine key={filteredLogs[index].id ? filteredLogs[index].id : index} message={filteredLogs[index]} />;
        }
        return <div style={style}>{content}</div>;
    };

    const search = useRef<HTMLInputElement>(null);

    const handleMouseEnter = () => {
        setState({ ...state, activeSearchField: search.current })
    }

    const updateFilter = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setSearchText(e.target.value)

        if (hasNextPage && !isNextPageLoading) {
            setIsNextPageLoading(true);
            let offset = logs.length;
            fetchLog(state.apiBaseUrl, state.currentChannel ?? "", state.currentUsername ?? "", year, month, null, offset).then((newLogs) => {
                setLogs(logs.concat(newLogs));
                setHasNextPage(false);
            });
        }
    };


    useEffect(() => {
        setState({ ...state, activeSearchField: search.current })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // If there are more items to be loaded then add an extra row to hold a loading indicator.
    const itemCount = hasNextPage ? filteredLogs.length + 1 : filteredLogs.length;

    // Only load 1 page of items at a time.
    // Pass an empty callback to InfiniteLoader in case it asks us to load more than once.
    const loadMoreItems = isNextPageLoading ? () => { } : loadNextPage;

    // Every row is loaded except for our loading indicator row.
    const isItemLoaded = (index: number) => !hasNextPage || index < filteredLogs.length;

    return <ContentLogContainer onMouseEnter={handleMouseEnter}>
        <TextField
            className="search"
            label="Search"
            inputRef={search}
            onChange={updateFilter}
            size="small"
            InputProps={{
                startAdornment: (
                    <InputAdornment position="start">
                        <Search />
                    </InputAdornment>
                ),
            }}
        />
        <InfiniteLoader
            isItemLoaded={isItemLoaded}
            itemCount={itemCount}
            loadMoreItems={loadMoreItems}
        >
            {({ onItemsRendered, ref }) => (<List
                className="list"
                height={600}
                itemCount={itemCount}
                itemSize={20}
                width={"100%"}
                onItemsRendered={onItemsRendered}
                ref={ref}
            >
                {Row}
            </List>
            )}
        </InfiniteLoader>
    </ContentLogContainer>
}

async function fetchLog(
    apiBaseUrl: string,
    channel: string,
    username: string,
    year: string,
    month: string,
    limit: number | null,
    offset: number | null,
): Promise<Array<LogMessage>> {
    const channelIsId = isUserId(channel);
    const usernameIsId = isUserId(username);

    if (channelIsId) {
        channel = getUserId(channel);
    }
    if (usernameIsId) {
        username = getUserId(username);
    }

    const queryUrl = new URL(
        `${apiBaseUrl}/channel${channelIsId ? "id" : ""}/${channel}/user${usernameIsId ? "id" : ""
        }/${username}/${year}/${month}`,
    );
    queryUrl.searchParams.append("jsonBasic", "1");
    // if (!state.settings.newOnBottom.value) {
    //     queryUrl.searchParams.append("reverse", "1");
    // }

    if (limit) {
        queryUrl.searchParams.append("limit", limit.toString());
    }
    if (offset) {
        queryUrl.searchParams.append("offset", offset.toString());
    }

    const response = await fetch(queryUrl.toString());

    if (!response.ok) {
        return [];
    }

    let data: UserLogResponse = await response.json();

    const messages: Array<LogMessage> = [];

    for (const msg of data.messages) {
        messages.push({
            ...msg,
            timestamp: new Date(msg.timestamp),
            emotes: parseEmotes(msg.text, msg.tags["emotes"]),
        });
    }

    return messages;
}

function parseEmotes(
    messageText: string,
    emotes: string | undefined,
): Array<Emote> {
    const parsed: Array<Emote> = [];
    if (!emotes) {
        return parsed;
    }

    const groups = emotes.split("/");

    for (const group of groups) {
        const [id, positions] = group.split(":");
        const positionGroups = positions.split(",");

        for (const positionGroup of positionGroups) {
            const [startPos, endPos] = positionGroup.split("-");

            const startIndex = Number(startPos);
            const endIndex = Number(endPos) + 1;

            parsed.push({
                id,
                startIndex: startIndex,
                endIndex: endIndex,
                code: runes.substr(messageText, startIndex, endIndex - startIndex + 1),
            });
        }
    }

    return parsed;
}
