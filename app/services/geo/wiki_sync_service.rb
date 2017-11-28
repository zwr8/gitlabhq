module Geo
  class WikiSyncService < BaseSyncService
    include Gitlab::ShellAdapter

    self.type = :wiki

    private

    def sync_repository(redownload = false)
      fetch_wiki_repository(redownload)
    end

    def fetch_wiki_repository(redownload)
      log_info('Fetching wiki repository')
      update_registry(started_at: DateTime.now)

      if redownload
        log_info('Redownloading wiki')
        fetch_geo_mirror(build_temporary_repository)
        set_temp_repository_as_main
      else
        project.wiki.ensure_repository
        fetch_geo_mirror(project.wiki.repository)
      end

      update_registry(finished_at: DateTime.now)

      log_info('Finished wiki sync',
               update_delay_s: update_delay_in_seconds,
               download_time_s: download_time_in_seconds)
    rescue Gitlab::Git::RepositoryMirroring::RemoteError,
           Gitlab::Shell::Error,
           ProjectWiki::CouldNotCreateWikiError,
           Geo::EmptyCloneUrlPrefixError => e
      fail_registry('Error syncing wiki repository', e)
    rescue Gitlab::Git::Repository::NoRepository => e
      fail_registry('Invalid wiki', e)

      log_info('Setting force_to_redownload flag')
      registry.update(force_to_redownload_wiki: true,)
    ensure
      clean_up_temporary_repository if redownload
    end

    def ssh_url_to_wiki
      "#{primary_ssh_path_prefix}#{project.full_path}.wiki.git"
    end

    def repository
      project.wiki.repository
    end

    def fail_registry(message, error)
      log_error(message, error)

      registry.update!(last_wiki_sync_failure: "#{message}: #{error.message}",
                       wiki_retry_count: retry_count + 1)
    end

    def retry_count
      registry.public_send("#{type}_retry_count") || -1 # rubocop:disable GitlabSecurity/PublicSend
    end
  end
end
