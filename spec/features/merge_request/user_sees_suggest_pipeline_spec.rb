# frozen_string_literal: true

require 'spec_helper'

RSpec.describe 'Merge request > User sees suggest pipeline', :js do
  let(:merge_request) { create(:merge_request) }
  let(:project) { merge_request.source_project }
  let(:user) { project.creator }

  before do
    stub_application_setting(auto_devops_enabled: false)
    stub_experiment(suggest_pipeline: true)
    stub_experiment_for_user(suggest_pipeline: true)
    project.add_maintainer(user)
    sign_in(user)
    visit project_merge_request_path(project, merge_request)
  end

  it 'shows the suggest pipeline widget and then allows dismissal correctly' do
    expect(page).to have_content('Are you adding technical debt or code vulnerabilities?')

    page.within '.mr-pipeline-suggest' do
      find('[data-testid="close"]').click
    end

    wait_for_requests

    expect(page).not_to have_content('Are you adding technical debt or code vulnerabilities?')

    # Reload so we know the user callout was registered
    visit page.current_url

    expect(page).not_to have_content('Are you adding technical debt or code vulnerabilities?')
  end
end
